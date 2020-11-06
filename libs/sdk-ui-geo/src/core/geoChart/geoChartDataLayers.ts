// (C) 2019-2020 GoodData Corporation
import partial from "lodash/partial";
import mapboxgl from "mapbox-gl";
import {
    DEFAULT_CLUSTER_FILTER,
    DEFAULT_CLUSTER_LABELS_CONFIG,
    DEFAULT_CLUSTER_LAYER_NAME,
    DEFAULT_CLUSTER_POINT_BORDERS,
    DEFAULT_CLUSTER_POINT_COLORS,
    DEFAULT_CLUSTER_POINT_SIZES,
    DEFAULT_LAYER_NAME,
    DEFAULT_PUSHPIN_BORDER_COLOR_VALUE,
    DEFAULT_PUSHPIN_OPTIONS,
    PUSHPIN_STYLE_CIRCLE,
    PUSHPIN_STYLE_CIRCLE_COLOR,
    PUSHPIN_STYLE_CIRCLE_SIZE,
    PUSHPIN_STYLE_CIRCLE_STROKE_COLOR,
    EMPTY_SEGMENT_VALUE,
    PUSHPIN_SIZE_OPTIONS_MAP,
    DEFAULT_CHOROPLETH_LAYER_NAME,
    DEFAULT_CHOROPLETH_LAYER_BORDER,
} from "./constants/geoChart";
import { IGeoData, IGeoPointsConfig, IGeoConfig } from "../../GeoChart";
import { BucketNames } from "@gooddata/sdk-ui";
import { getMinMax } from "./helpers/geoChart/common";

function createPushpinSizeOptions(
    geoData: IGeoData,
    geoPointsConfig: IGeoPointsConfig,
): mapboxgl.Expression | number {
    const { size } = geoData;
    const defaultRadius = PUSHPIN_SIZE_OPTIONS_MAP.min.default / 2;

    if (size === undefined || size.data.length === 0) {
        return defaultRadius;
    }

    const { min: minSizeFromData, max: maxSizeFromData } = getMinMax(size.data);
    if (maxSizeFromData === minSizeFromData) {
        return defaultRadius;
    }

    const { minSize: minSizeFromConfig = "default", maxSize: maxSizeFromConfig = "default" } =
        geoPointsConfig || {};
    const minSizeInPixel = PUSHPIN_SIZE_OPTIONS_MAP.min[minSizeFromConfig];
    const maxSizeInPixel = PUSHPIN_SIZE_OPTIONS_MAP.max[maxSizeFromConfig];
    const base = Math.pow(maxSizeInPixel / minSizeInPixel, 0.25);
    const getStopPointSize = partial(getPointSize, minSizeInPixel, base);

    // The mouseenter event uses queryRenderedFeatures to determine when the mouse is touching a feature
    // And queryRenderedFeatures is not supporting nested object in expression
    // https://github.com/mapbox/mapbox-gl-js/issues/7194
    return [
        "step",
        ["get", "pushpinSize"],
        Math.round(minSizeInPixel / 2), // a
        getStopPointSize(1),
        Math.round(getStopPointSize(1) / 2), // ar^1
        getStopPointSize(2),
        Math.round(getStopPointSize(2) / 2), // ar^2
        getStopPointSize(3),
        Math.round(getStopPointSize(3) / 2), // ar^3
        maxSizeInPixel,
        Math.round(maxSizeInPixel / 2), // ar^4
    ];
}

function getPointSize(minSizeInPixel: number, base: number, exponent: number): number {
    const stepValue = minSizeInPixel * Math.pow(base, exponent);
    return parseFloat(stepValue.toFixed(2));
}

export function createPushpinFilter(selectedSegmentItems: string[]): mapboxgl.Expression {
    return [
        "match",
        ["get", "uri", ["object", ["get", BucketNames.SEGMENT]]],
        selectedSegmentItems.length ? selectedSegmentItems : [EMPTY_SEGMENT_VALUE],
        true,
        false,
    ]; // true/false are the output values, from the https://docs.mapbox.com/mapbox-gl-js/style-spec/expressions/#match
}

function createPushpinColorOptions(): mapboxgl.Expression {
    return ["string", ["get", "background", ["object", ["get", "color"]]]];
}

function createPushpinBorderOptions(): mapboxgl.Expression {
    return ["string", ["get", "border", ["object", ["get", "color"]]], DEFAULT_PUSHPIN_BORDER_COLOR_VALUE];
}

export function createPushpinDataLayer(
    dataSourceName: string,
    geoData: IGeoData,
    config: IGeoConfig,
): mapboxgl.Layer {
    const { selectedSegmentItems = [], points: geoPointsConfig = {} } = config || {};
    const layer: mapboxgl.Layer = {
        id: DEFAULT_LAYER_NAME,
        type: PUSHPIN_STYLE_CIRCLE,
        source: dataSourceName,
        paint: {
            ...DEFAULT_PUSHPIN_OPTIONS,
            [PUSHPIN_STYLE_CIRCLE_COLOR]: createPushpinColorOptions(),
            [PUSHPIN_STYLE_CIRCLE_STROKE_COLOR]: createPushpinBorderOptions(),
            [PUSHPIN_STYLE_CIRCLE_SIZE]: createPushpinSizeOptions(geoData, geoPointsConfig),
        },
    };
    if (selectedSegmentItems.length > 0) {
        layer.filter = createPushpinFilter(selectedSegmentItems);
    }
    return layer;
}

/**
 * Create layer for clustered points/pins which have 'properties.point_count' indicates number of same points is clustered together
 * @param dataSourceName
 */
export function createClusterPoints(dataSourceName: string): mapboxgl.Layer {
    return {
        id: DEFAULT_CLUSTER_LAYER_NAME,
        type: PUSHPIN_STYLE_CIRCLE,
        source: dataSourceName,
        filter: DEFAULT_CLUSTER_FILTER,
        paint: {
            ...DEFAULT_CLUSTER_POINT_BORDERS,
            [PUSHPIN_STYLE_CIRCLE_COLOR]: DEFAULT_CLUSTER_POINT_COLORS,
            [PUSHPIN_STYLE_CIRCLE_SIZE]: DEFAULT_CLUSTER_POINT_SIZES,
        },
    };
}

/**
 * Create layer for cluster labels which indicate number of points/pins is clustered
 * @param dataSourceName
 */
export function createClusterLabels(dataSourceName: string): mapboxgl.Layer {
    return {
        ...DEFAULT_CLUSTER_LABELS_CONFIG,
        source: dataSourceName,
        filter: DEFAULT_CLUSTER_FILTER,
    };
}
/**
 * Create layer for un-clustered points which are not close to others
 * @param dataSourceName
 * @param selectedSegmentItems
 */
export function createUnclusterPoints(dataSourceName: string): mapboxgl.Layer {
    return {
        id: DEFAULT_LAYER_NAME,
        type: PUSHPIN_STYLE_CIRCLE,
        source: dataSourceName,
        filter: ["!", DEFAULT_CLUSTER_FILTER],
        paint: {
            ...DEFAULT_PUSHPIN_OPTIONS,
            [PUSHPIN_STYLE_CIRCLE_COLOR]: createPushpinColorOptions(),
            [PUSHPIN_STYLE_CIRCLE_STROKE_COLOR]: DEFAULT_PUSHPIN_BORDER_COLOR_VALUE,
            [PUSHPIN_STYLE_CIRCLE_SIZE]: PUSHPIN_SIZE_OPTIONS_MAP.min.default / 2,
        },
    };
}

export function createChoroplethLayer(dataSourceName: string, attrName: string): mapboxgl.Layer {
    return {
        id: DEFAULT_CHOROPLETH_LAYER_NAME,
        type: "fill",
        source: dataSourceName,
        paint: {
            "fill-color": [
                "interpolate",
                ["linear"],
                ["get", attrName],
                0,
                "#F5F502",
                20000,
                "#F5CC01",
                50000,
                "#F5A301",
                100000,
                "#F57A02",
                200000,
                "#F55100",
                500000,
                "#F52900",
                700000,
                "#F50900",
                1000000,
                "#FF0000",
                5000000,
                "#BD0426",
            ],
            "fill-opacity": 0.75,
        },
    };
}

export function createChoroplethBorderLayer(dataSourceName: string): mapboxgl.Layer {
    return {
        id: DEFAULT_CHOROPLETH_LAYER_BORDER,
        type: "line",
        source: dataSourceName,
        layout: {},
        paint: {
            "line-color": "#ffffff",
            "line-width": 1,
        },
    };
}
