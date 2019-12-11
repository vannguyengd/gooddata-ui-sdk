// (C) 2007-2018 GoodData Corporation
import * as React from "react";
import { IntlWrapper } from "../../base/translations/IntlWrapper";
import {
    IntlTranslationsProvider,
    ITranslationsComponentProps,
} from "../../base/translations/TranslationsProvider";
import { fixEmptyHeaderItems } from "../_base/fixEmptyHeaderItems";
import { ILoadingInjectedProps, withEntireDataView } from "../_base/NewLoadingHOC";
import { newErrorMapping, IErrorDescriptors } from "../../base/errors/errorHandling";
import { ICommonChartProps, ICoreChartProps } from "../chartProps";
import XirrTransformation from "./internal/XirrTransformation";
import { defaultCoreChartProps } from "../_commons/defaultProps";
import { ErrorCodes } from "../../base/errors/GoodDataSdkError";

type Props = ICoreChartProps & ILoadingInjectedProps;
export class XirrStateless extends React.Component<Props, {}> {
    public static defaultProps: Partial<ICommonChartProps> = defaultCoreChartProps;

    private errorMap: IErrorDescriptors;

    constructor(props: Props) {
        super(props);
        this.errorMap = newErrorMapping(props.intl);
    }

    public render(): JSX.Element {
        const { dataView, error, isLoading } = this.props;

        const ErrorComponent = this.props.ErrorComponent;
        const LoadingComponent = this.props.LoadingComponent;

        if (error) {
            const errorProps = this.errorMap[
                this.errorMap.hasOwnProperty(error) ? error : ErrorCodes.UNKNOWN_ERROR
            ];
            return ErrorComponent ? <ErrorComponent code={error} {...errorProps} /> : null;
        }

        // when in pageable mode (getPage present) never show loading (its handled by the component)
        if (isLoading || !dataView) {
            return LoadingComponent ? <LoadingComponent /> : null;
        }

        return this.renderVisualization();
    }

    protected renderVisualization(): JSX.Element {
        const { afterRender, drillableItems, locale, dataView, onDrill, config } = this.props;

        return (
            <IntlWrapper locale={locale}>
                <IntlTranslationsProvider>
                    {(props: ITranslationsComponentProps) => {
                        // TODO: SDK8: evil; fix this conceptually
                        fixEmptyHeaderItems(dataView, props.emptyHeaderString);

                        return (
                            <XirrTransformation
                                dataView={dataView}
                                onAfterRender={afterRender}
                                onDrill={onDrill}
                                drillableItems={drillableItems}
                                config={config}
                            />
                        );
                    }}
                </IntlTranslationsProvider>
            </IntlWrapper>
        );
    }
}

export const CoreXirr = withEntireDataView(XirrStateless);