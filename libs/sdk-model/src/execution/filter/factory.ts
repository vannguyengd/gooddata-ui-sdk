// (C) 2019-2020 GoodData Corporation
import invariant from "ts-invariant";
import isNil from "lodash/isNil";
import {
    IAttributeElements,
    ComparisonConditionOperator,
    IAbsoluteDateFilter,
    IMeasureValueFilter,
    INegativeAttributeFilter,
    IPositiveAttributeFilter,
    IRelativeDateFilter,
    RangeConditionOperator,
} from "./index";
import { IAttribute, attributeDisplayFormRef } from "../attribute";
import { ObjRef, isObjRef, Identifier, UriRef, LocalIdRef } from "../../objRef";
import { IMeasure, isMeasure, measureLocalId } from "../measure";
import { idRef, localIdRef } from "../../objRef/factory";

/**
 * Creates a new positive attribute filter.
 *
 * @param attributeOrRef - either instance of attribute to create filter for or ref or identifier of attribute's display form
 * @param inValues - values to filter for; these can be either specified as AttributeElements object or as an array
 *  of attribute element _values_; if you specify empty array, then the filter will be noop and will be ignored
 * @public
 */
export function newPositiveAttributeFilter(
    attributeOrRef: IAttribute | ObjRef | Identifier,
    inValues: IAttributeElements | string[],
): IPositiveAttributeFilter {
    const objRef = isObjRef(attributeOrRef)
        ? attributeOrRef
        : typeof attributeOrRef === "string"
        ? idRef(attributeOrRef)
        : attributeDisplayFormRef(attributeOrRef);

    const inObject: IAttributeElements = Array.isArray(inValues) ? { values: inValues } : inValues;

    return {
        positiveAttributeFilter: {
            displayForm: objRef,
            in: inObject,
        },
    };
}

/**
 * Creates a new negative attribute filter.
 *
 * @param attributeOrRef - either instance of attribute to create filter for or ref or identifier of attribute's display form
 * @param notInValues - values to filter out; these can be either specified as AttributeElements object or as an array
 *  of attribute element _values_; if you specify empty array, then the filter will be noop and will be ignored
 * @public
 */
export function newNegativeAttributeFilter(
    attributeOrRef: IAttribute | ObjRef | Identifier,
    notInValues: IAttributeElements | string[],
): INegativeAttributeFilter {
    const objRef = isObjRef(attributeOrRef)
        ? attributeOrRef
        : typeof attributeOrRef === "string"
        ? idRef(attributeOrRef)
        : attributeDisplayFormRef(attributeOrRef);

    const notInObject: IAttributeElements = Array.isArray(notInValues)
        ? { values: notInValues }
        : notInValues;

    return {
        negativeAttributeFilter: {
            displayForm: objRef,
            notIn: notInObject,
        },
    };
}

/**
 * Creates a new absolute date filter.
 *
 * @param dateDataSet - ref or identifier of the date data set to filter on
 * @param from - start of the interval in ISO-8601 calendar date format
 * @param to - end of the interval in ISO-8601 calendar date format
 * @public
 */
export function newAbsoluteDateFilter(
    dateDataSet: ObjRef | Identifier,
    from: string,
    to: string,
): IAbsoluteDateFilter {
    const dataSet = isObjRef(dateDataSet) ? dateDataSet : idRef(dateDataSet);
    return {
        absoluteDateFilter: {
            dataSet,
            from,
            to,
        },
    };
}

/**
 * Creates a new relative date filter.
 *
 * @param dateDataSet - ref or identifier of the date data set to filter on
 * @param granularity - granularity of the filters (month, year, etc.)
 * @param from - start of the interval – negative numbers mean the past, zero means today, positive numbers mean the future
 * @param to - end of the interval – negative numbers mean the past, zero means today, positive numbers mean the future
 * @public
 */
export function newRelativeDateFilter(
    dateDataSet: ObjRef | Identifier,
    granularity: string,
    from: number,
    to: number,
): IRelativeDateFilter {
    const dataSet = isObjRef(dateDataSet) ? dateDataSet : idRef(dateDataSet);
    return {
        relativeDateFilter: {
            dataSet,
            granularity,
            from,
            to,
        },
    };
}

/**
 * Creates a new measure value filter.
 *
 * @param measureOrRef - instance of measure to filter, or reference of the measure object; if instance of measure is
 *   provided, then it is assumed this measure is in scope of execution and will be referenced by the filter by
 *   its local identifier
 * @param operator - comparison or range operator to use in the filter
 * @param value - the value to compare to
 * @param treatNullValuesAs - value to use instead of null values
 * @public
 */
export function newMeasureValueFilter(
    measureOrRef: IMeasure | UriRef | LocalIdRef | string,
    operator: ComparisonConditionOperator,
    value: number,
    treatNullValuesAs?: number,
): IMeasureValueFilter;

/**
 * Creates a new measure value filter.
 *
 * @param measureOrRef - instance of measure to filter, or reference of the measure object; if instance of measure is
 *   provided, then it is assumed this measure is in scope of execution and will be referenced by the filter by
 *   its local identifier
 * @param operator - range operator to use in the filter
 * @param from - the start of the range
 * @param to - the end of the range
 * @param treatNullValuesAs - value to use instead of null values
 * @public
 */
export function newMeasureValueFilter(
    measureOrRef: IMeasure | UriRef | LocalIdRef | string,
    operator: RangeConditionOperator,
    from: number,
    to: number,
    treatNullValuesAs?: number,
): IMeasureValueFilter;

/**
 * Creates a new measure value filter.
 *
 * @param measureOrRef - instance of measure to filter, or reference of the measure object; if instance of measure is
 *   provided, then it is assumed this measure is in scope of execution and will be referenced by the filter by
 *   its local identifier
 * @param operator - comparison or range operator to use in the filter
 * @param val1 - first numeric value, used as value in comparison or as 'from' value in range operators
 * @param val2OrTreatNullValuesAsInComparison - second numeric value, required in range operators and used in 'to' value; optional in comparison operators used as 'treatNullValuesAs' value
 * @param treatNullValuesAsInRange - third numeric value, optional in range operators and used as 'treatNullValuesAs' value; optional and ignored in comparison operators
 * @public
 */
export function newMeasureValueFilter(
    measureOrRef: IMeasure | UriRef | LocalIdRef | string,
    operator: ComparisonConditionOperator | RangeConditionOperator,
    val1: number,
    val2OrTreatNullValuesAsInComparison?: number,
    treatNullValuesAsInRange?: number,
): IMeasureValueFilter {
    const ref: UriRef | LocalIdRef = isMeasure(measureOrRef)
        ? { localIdentifier: measureLocalId(measureOrRef) }
        : typeof measureOrRef === "string"
        ? localIdRef(measureOrRef)
        : measureOrRef;

    if (operator === "BETWEEN" || operator === "NOT_BETWEEN") {
        invariant(
            val2OrTreatNullValuesAsInComparison !== undefined,
            "measure value filter with range operator requires two numeric values",
        );

        const nullValuesProp = !isNil(treatNullValuesAsInRange)
            ? { treatNullValuesAs: treatNullValuesAsInRange }
            : {};

        return {
            measureValueFilter: {
                measure: ref,
                condition: {
                    range: {
                        operator,
                        from: val1,
                        to: val2OrTreatNullValuesAsInComparison!,
                        ...nullValuesProp,
                    },
                },
            },
        };
    } else {
        const nullValuesProp = !isNil(val2OrTreatNullValuesAsInComparison)
            ? { treatNullValuesAs: val2OrTreatNullValuesAsInComparison }
            : {};

        return {
            measureValueFilter: {
                measure: ref,
                condition: {
                    comparison: {
                        operator,
                        value: val1,
                        ...nullValuesProp,
                    },
                },
            },
        };
    }
}
