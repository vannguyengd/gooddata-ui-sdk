// (C) 2019 GoodData Corporation
import { GdcVisualizationObject } from "@gooddata/gd-bear-model";
import {
    IMeasureDefinitionType,
    IMeasure,
    isSimpleMeasure,
    IMeasureDefinition,
    measureAlias,
    measureFormat,
    measureLocalId,
    measureTitle,
    measureAggregation,
    measureDoesComputeRatio,
    measureIdentifier,
    measureUri,
    isArithmeticMeasure,
    measureArithmeticOperands,
    measureArithmeticOperator,
    IArithmeticMeasureDefinition,
    isPoPMeasure,
    IPoPMeasureDefinition,
    measureMasterIdentifier,
    measurePopAttribute,
    isPreviousPeriodMeasure,
    IPreviousPeriodMeasureDefinition,
    measurePreviousPeriodDateDataSets,
    measureFilters,
} from "@gooddata/sdk-model";
import { convertFilter, shouldFilterBeIncluded } from "./FilterConverter";

const convertPreviousPeriodMeasureDefinition = (
    measure: IMeasure<IPreviousPeriodMeasureDefinition>,
): GdcVisualizationObject.IPreviousPeriodMeasureDefinition => {
    return {
        previousPeriodMeasure: {
            measureIdentifier: measureMasterIdentifier(measure)!,
            dateDataSets: measurePreviousPeriodDateDataSets(measure)!,
        },
    };
};

const convertPoPMeasureDefinition = (
    measure: IMeasure<IPoPMeasureDefinition>,
): GdcVisualizationObject.IPoPMeasureDefinition => {
    return {
        popMeasureDefinition: {
            measureIdentifier: measureMasterIdentifier(measure)!,
            popAttribute: measurePopAttribute(measure)!,
        },
    };
};

const convertArithmeticMeasureDefinition = (
    measure: IMeasure<IArithmeticMeasureDefinition>,
): GdcVisualizationObject.IArithmeticMeasureDefinition => {
    return {
        arithmeticMeasure: {
            measureIdentifiers: measureArithmeticOperands(measure)!,
            operator: measureArithmeticOperator(measure)!,
        },
    };
};

const convertSimpleMeasureDefinition = (
    measure: IMeasure<IMeasureDefinition>,
): GdcVisualizationObject.IMeasureDefinition => {
    const identifier = measureIdentifier(measure);
    const uri = measureUri(measure);

    if (!identifier && !uri) {
        throw new Error("Measure has neither uri nor identifier.");
    }

    const filters = measureFilters(measure) || [];

    return {
        measureDefinition: {
            aggregation: measureAggregation(measure),
            computeRatio: measureDoesComputeRatio(measure),
            filters: filters.filter(shouldFilterBeIncluded).map(convertFilter),
            item: identifier ? { identifier } : { uri: uri! },
        },
    };
};

const convertMeasureDefinition = (
    measure: IMeasure<IMeasureDefinitionType>,
): GdcVisualizationObject.IMeasureDefinitionType => {
    if (isSimpleMeasure(measure)) {
        return convertSimpleMeasureDefinition(measure);
    } else if (isArithmeticMeasure(measure)) {
        return convertArithmeticMeasureDefinition(measure);
    } else if (isPoPMeasure(measure)) {
        return convertPoPMeasureDefinition(measure);
    } else if (isPreviousPeriodMeasure(measure)) {
        return convertPreviousPeriodMeasureDefinition(measure);
    }

    throw new Error("Unknown measure type");
};

export const convertMeasure = (
    measure: IMeasure<IMeasureDefinitionType>,
): GdcVisualizationObject.IMeasure => {
    return {
        measure: {
            alias: measureAlias(measure),
            definition: convertMeasureDefinition(measure),
            format: measureFormat(measure),
            localIdentifier: measureLocalId(measure),
            title: measureTitle(measure),
        },
    };
};