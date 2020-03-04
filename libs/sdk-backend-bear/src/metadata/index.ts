// (C) 2019-2020 GoodData Corporation
import flow from "lodash/flow";
import filter from "lodash/fp/filter";
import first from "lodash/first";
import map from "lodash/fp/map";
import uniq from "lodash/fp/uniq";
import replace from "lodash/fp/replace";
import invariant from "ts-invariant";
import { IWorkspaceMetadata, IInsightQueryOptions, IInsightQueryResult } from "@gooddata/sdk-backend-spi";
import { GdcVisualizationClass, GdcMetadata, GdcVisualizationObject } from "@gooddata/gd-bear-model";
import {
    IVisualizationClass,
    IInsight,
    IAttributeDisplayForm,
    IMeasureExpressionToken,
    IInsightDefinition,
    insightId,
    ObjRef,
    insightVisualizationUrl,
    IObjectMeta,
} from "@gooddata/sdk-model";
import { AuthenticatedCallGuard } from "../commonTypes";
import { convertVisualizationClass } from "../toSdkModel/VisualizationClassConverter";
import { convertVisualization } from "../toSdkModel/VisualizationConverter";
import { tokenizeExpression, getTokenValuesOfType } from "./measureExpressionTokens";
import { convertInsightDefinition, convertInsight } from "../fromSdkModel/InsightConverter";
import { convertObjectMeta } from "../toSdkModel/MetaConverter";
import { objRefToUri, getObjectIdFromUri } from "../utils/api";

export class BearWorkspaceMetadata implements IWorkspaceMetadata {
    constructor(private readonly authCall: AuthenticatedCallGuard, public readonly workspace: string) {}

    public getVisualizationClass = async (ref: ObjRef): Promise<IVisualizationClass> => {
        const uri = await objRefToUri(ref, this.workspace, this.authCall);
        const visClassResult = await this.authCall(
            sdk => sdk.md.getObjects(this.workspace, [uri]) as Promise<any>,
        );

        return convertVisualizationClass(visClassResult[0]);
    };

    public getVisualizationClasses = async (): Promise<IVisualizationClass[]> => {
        const visualizationClassesResult: GdcVisualizationClass.IVisualizationClassWrapped[] = await this.authCall(
            sdk =>
                sdk.md.getObjectsByQuery(this.workspace, {
                    category: "visualizationClass",
                }),
        );

        const isVisClassNotDeprecated = (visClass: GdcVisualizationClass.IVisualizationClassWrapped) =>
            visClass.visualizationClass.meta.deprecated !== "1";

        return flow(
            filter(isVisClassNotDeprecated),
            map(convertVisualizationClass),
        )(visualizationClassesResult);
    };

    public getInsight = async (ref: ObjRef): Promise<IInsight> => {
        const uri = await objRefToUri(ref, this.workspace, this.authCall);
        const visualization = await this.authCall(sdk => sdk.md.getVisualization(uri));

        const visClassResult: any[] = await this.authCall(sdk =>
            sdk.md.getObjects(this.workspace, [
                visualization.visualizationObject.content.visualizationClass.uri,
            ]),
        );

        const visClass = visClassResult[0];
        const visualizationClassUri = visClass.visualizationClass.content.url;

        return convertVisualization(visualization, visualizationClassUri);
    };

    public getInsights = async (options?: IInsightQueryOptions): Promise<IInsightQueryResult> => {
        const mergedOptions = { ...options, getTotalCount: true };
        const {
            items: visualizations,
            paging: { count, offset, totalCount },
        } = await this.authCall(sdk =>
            sdk.md.getObjectsByQueryWithPaging<GdcVisualizationObject.IVisualization>(this.workspace, {
                category: "visualizationObject",
                ...mergedOptions,
            }),
        );

        const visualizationClasses = await this.getVisualizationClasses();
        const visualizationClassUrlByVisualizationClassUri: {
            [key: string]: string;
        } = visualizationClasses.reduce((acc, el) => {
            if (!el.visualizationClass.uri) {
                return acc;
            }
            return {
                ...acc,
                [el.visualizationClass.uri]: el.visualizationClass.url,
            };
        }, {});

        const insights = visualizations.map(visualization =>
            convertVisualization(
                visualization,
                visualizationClassUrlByVisualizationClassUri[
                    visualization.visualizationObject.content.visualizationClass.uri
                ],
            ),
        );

        const emptyResult: IInsightQueryResult = {
            items: [],
            limit: count,
            offset: totalCount!,
            totalCount: totalCount!,
            next: () => Promise.resolve(emptyResult),
        };

        const hasNextPage = offset + count < totalCount!;

        return {
            items: insights,
            limit: count,
            offset,
            totalCount: totalCount!,
            next: hasNextPage
                ? () => this.getInsights({ ...options, offset: offset + count })
                : () => Promise.resolve(emptyResult),
        };
    };

    public createInsight = async (insight: IInsightDefinition): Promise<IInsight> => {
        const withConvertedVisClass = await this.getInsightWithConvertedVisClass(insight);

        const mdObject = await this.authCall(sdk =>
            sdk.md.saveVisualization(this.workspace, {
                visualizationObject: convertInsightDefinition(withConvertedVisClass),
            }),
        );

        return convertVisualization(mdObject, insightVisualizationUrl(insight));
    };

    public updateInsight = async (insight: IInsight): Promise<IInsight> => {
        const id = insightId(insight);
        const uri = await this.authCall(sdk => sdk.md.getObjectUri(this.workspace, id));

        const withConvertedVisClass = await this.getInsightWithConvertedVisClass(insight);

        await this.authCall(sdk =>
            sdk.md.updateVisualization(this.workspace, uri, {
                visualizationObject: convertInsight(withConvertedVisClass),
            }),
        );
        // sdk.md.updateVisualization returns just an URI, so we need to return the original insight
        return insight;
    };

    public deleteInsight = async (ref: ObjRef): Promise<void> => {
        const uri = await objRefToUri(ref, this.workspace, this.authCall);
        await this.authCall(sdk => sdk.md.deleteVisualization(uri));
    };

    public openInsightAsReport = async (insight: IInsightDefinition): Promise<string> => {
        const visualizationObject = convertInsightDefinition(insight);
        return this.authCall(sdk =>
            sdk.md.openVisualizationAsReport(this.workspace, { visualizationObject }),
        );
    };

    public getAttributeDisplayForm = async (ref: ObjRef): Promise<IAttributeDisplayForm> => {
        const displayFormUri = await objRefToUri(ref, this.workspace, this.authCall);
        const displayFormDetails = await this.authCall(sdk => sdk.md.getObjectDetails(displayFormUri));

        return {
            attribute: {
                uri: displayFormDetails.attributeDisplayForm.content.formOf,
            },
            id: displayFormDetails.attributeDisplayForm.meta.identifier,
            title: displayFormDetails.attributeDisplayForm.meta.title,
        };
    };

    public async getMeasureExpressionTokens(ref: ObjRef): Promise<IMeasureExpressionToken[]> {
        const uri = await objRefToUri(ref, this.workspace, this.authCall);
        const metricMetadata = await this.authCall(sdk => sdk.xhr.getParsed<GdcMetadata.WrappedObject>(uri));

        if (!GdcMetadata.isWrappedMetric(metricMetadata)) {
            throw new Error(
                "To get measure expression tokens, provide the correct measure identifier. Did you provide a measure identifier?",
            );
        }

        const expressionTokens = tokenizeExpression(metricMetadata.metric.content.expression);
        const expressionIdentifiers = getTokenValuesOfType("identifier", expressionTokens);
        const expressionUris = getTokenValuesOfType("uri", expressionTokens);
        const expressionElementUris = getTokenValuesOfType("element_uri", expressionTokens);
        const expressionIdentifierUrisPairs = await this.authCall(sdk =>
            sdk.md.getUrisFromIdentifiers(this.workspace, expressionIdentifiers),
        );
        const expressionIdentifierUris = expressionIdentifierUrisPairs.map(pair => pair.uri);
        const allExpressionElementAttributeUris = flow(
            map(replace(/\/elements\?id=.*/, "")),
            uniq,
        )(expressionElementUris);
        const allExpressionUris = uniq([
            ...expressionUris,
            ...expressionIdentifierUris,
            ...allExpressionElementAttributeUris,
        ]);
        const allExpressionWrappedObjects = await this.authCall(sdk =>
            sdk.md.getObjects(this.workspace, allExpressionUris),
        );
        const allExpressionObjects = allExpressionWrappedObjects.map(GdcMetadata.unwrapMetadataObject);
        const allExpressionElements = await Promise.all(
            expressionElementUris.map(elementUri =>
                this.authCall(sdk => sdk.md.getAttributeElementDefaultDisplayFormValue(elementUri)),
            ),
        );

        const objectByUri = allExpressionObjects.reduce((acc: { [key: string]: GdcMetadata.IObject }, el) => {
            return {
                ...acc,
                [el.meta.uri]: el,
            };
        }, {});

        const objectByIdentifier = allExpressionObjects.reduce(
            (acc: { [key: string]: GdcMetadata.IObject }, el) => {
                return {
                    ...acc,
                    [el.meta.identifier]: el,
                };
            },
            {},
        );

        const elementByUri = allExpressionElements.reduce(
            (acc: { [key: string]: GdcMetadata.IAttributeElement }, el) => {
                if (!el) {
                    return acc;
                }
                return {
                    ...acc,
                    [el.uri]: el,
                };
            },
            {},
        );

        const expressionTokensWithDetails = expressionTokens.map(
            (token): IMeasureExpressionToken => {
                if (token.type === "element_uri") {
                    return {
                        type: "attributeElement",
                        value: token.value,
                        element: elementByUri[token.value],
                    };
                } else if (token.type === "uri") {
                    return {
                        type: "metadataObject",
                        value: token.value,
                        meta: convertObjectMeta(objectByUri[token.value].meta),
                    };
                } else if (token.type === "identifier") {
                    return {
                        type: "metadataObject",
                        value: token.value,
                        meta: convertObjectMeta(objectByIdentifier[token.value].meta),
                    };
                }

                return {
                    type: "text",
                    value: token.value,
                };
            },
        );

        return expressionTokensWithDetails;
    }

    public async getFactDatasetMeta(ref: ObjRef): Promise<IObjectMeta> {
        const uri = await objRefToUri(ref, this.workspace, this.authCall);
        const objectId = getObjectIdFromUri(uri);

        return this.authCall(async sdk => {
            const usedBy = await sdk.xhr.getParsed<{ entries: IObjectMeta[] }>(
                `/gdc/md/${this.workspace}/usedby2/${objectId}?types=dataSet`,
            );

            const dataset = first(usedBy.entries);

            invariant(dataset, "Fact must have a dataset associated to it.");

            return dataset!;
        });
    }

    private getVisualizationClassByUrl = async (url: string): Promise<IVisualizationClass | undefined> => {
        const allVisClasses = await this.getVisualizationClasses();
        return allVisClasses.find(visClass => visClass.visualizationClass.url === url);
    };

    private async getInsightWithConvertedVisClass<T extends IInsight | IInsightDefinition>(
        insight: T,
    ): Promise<T> {
        const visClassUrl = insightVisualizationUrl(insight);
        const visClass = await this.getVisualizationClassByUrl(visClassUrl);
        if (!visClass) {
            throw new Error(`Visualization class with url ${visClassUrl} not found.`);
        }

        // tslint:disable-next-line: no-object-literal-type-assertion
        const withFixedVisClass = {
            insight: {
                ...insight.insight,
                visualizationUrl: visClass.visualizationClass.uri, // bear client expects this to be the URI, not URL
            },
        } as T;

        return withFixedVisClass;
    }
}
