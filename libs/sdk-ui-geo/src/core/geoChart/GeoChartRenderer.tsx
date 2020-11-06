// (C) 2007-2020 GoodData Corporation
import React from "react";
import cx from "classnames";
import get from "lodash/get";
import isEqual from "lodash/isEqual";
import noop from "lodash/noop";
import mapboxgl from "mapbox-gl";
import invariant, { InvariantError } from "ts-invariant";
import {
    createClusterLabels,
    createClusterPoints,
    createPushpinDataLayer,
    createUnclusterPoints,
    createPushpinFilter,
    createChoroplethLayer,
    createChoroplethBorderLayer,
} from "./geoChartDataLayers";
import {
    createChoroplethDataSource,
    createPushpinDataSource,
    IGeoDataSourceProps,
} from "./geoChartDataSource";
import {
    DEFAULT_CHOROPLETH_LAYER_NAME,
    DEFAULT_CHOROPLETH_MAP,
    DEFAULT_CLUSTER_LABELS_CONFIG,
    DEFAULT_CLUSTER_LAYER_NAME,
    DEFAULT_DATA_SOURCE_NAME,
    DEFAULT_LAYER_NAME,
    DEFAULT_MAPBOX_OPTIONS,
    DEFAULT_TOOLTIP_OPTIONS,
    INTERACTION_EVENTS,
    LAYER_STYLE_LABEL_PREFIX,
    ZOOM_CONTROLS_HEIGHT,
} from "./constants/geoChart";
import { IGeoConfig, IGeoData, IGeoLngLat } from "../../GeoChart";

import { handlePushpinMouseEnter, handlePushpinMouseLeave } from "./geoChartTooltip";
import { getViewportOptions } from "./helpers/geoChart/viewport";
import {
    isClusteringAllowed,
    isPointsConfigChanged,
    isColorAssignmentItemChanged,
} from "./helpers/geoChart/common";
import { IDrillConfig, IHeaderPredicate, DataViewFacade } from "@gooddata/sdk-ui";
import { IColorStrategy } from "@gooddata/sdk-ui-vis-commons";
import { IDataView } from "@gooddata/sdk-backend-spi";
import { handleGeoPushpinDrillEvent } from "./helpers/geoChart/drilling";

import { WrappedComponentProps } from "react-intl";
import { countriesData } from "./constants/countries";

/**
 * @internal
 */
export interface IGeoChartRendererProps extends WrappedComponentProps {
    config: IGeoConfig;
    drillableItems: IHeaderPredicate[];
    drillConfig: IDrillConfig;
    dataView: IDataView;
    geoData: IGeoData;
    colorStrategy: IColorStrategy;
    afterRender(): void;
    onCenterPositionChanged(center: IGeoLngLat): void;
    onZoomChanged(zoom: number): void;
}

class GeoChartRenderer extends React.Component<IGeoChartRendererProps> {
    public static defaultProps: Partial<IGeoChartRendererProps> = {
        config: {
            mapboxToken: "",
        },
        afterRender: noop,
        onZoomChanged: noop,
        onCenterPositionChanged: noop,
    };

    private countriesGeo: any;

    private chart: mapboxgl.Map | undefined;
    private tooltip: mapboxgl.Popup | undefined;
    private navigationControlButton: mapboxgl.NavigationControl | null;

    private chartRef: HTMLElement | null;

    public constructor(props: IGeoChartRendererProps) {
        super(props);

        mapboxgl.accessToken = props.config.mapboxToken;
        this.navigationControlButton = null;
        this.chartRef = null;
        this.countriesGeo = null;
    }

    public componentDidUpdate(prevProps: IGeoChartRendererProps): void {
        const {
            config: { selectedSegmentItems },
            colorStrategy,
        } = this.props;
        const { config: prevConfig, colorStrategy: prevColorStrategy } = prevProps;
        const { selectedSegmentItems: prevSelectedSegmentItems = [] } = prevConfig || {};

        if (!this.chart) {
            return;
        }

        // resize map when component is updated
        // for example: toggle legend, change position of legend
        this.chart.resize();

        // only update map when style is ready
        // work around for ticket SD-898
        // avoid refresh whole map will be fixed in ticket SD-899
        if (!this.chart.isStyleLoaded()) {
            return;
        }
        const isColorChanged = isColorAssignmentItemChanged(
            prevColorStrategy.getColorAssignment(),
            colorStrategy.getColorAssignment(),
        );
        const selectedSegmentItemsChanged =
            selectedSegmentItems && !isEqual(selectedSegmentItems, prevSelectedSegmentItems);
        if (!isColorChanged && selectedSegmentItemsChanged) {
            return this.setFilterMap();
        }

        this.updateMapWithConfig(prevConfig, prevColorStrategy);
    }

    public componentDidMount(): void {
        const {
            config: { isChoroplethMap },
        } = this.props;

        this.createTooltip();
        this.createMap();
        this.createMapControls();
        if (isChoroplethMap) {
            fetch("https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson")
                .then((response) => response.json())
                .then((data) => {
                    const featuresObj = data.features.map((feature: any) => {
                        const country = countriesData.find((c) => c.ADMIN === feature.properties.ADMIN);
                        return {
                            ...feature,
                            properties: {
                                ...feature.properties,
                                case: country ? country.case : 0,
                            },
                        };
                    });
                    this.countriesGeo = {
                        ...data,
                        features: [...featuresObj],
                    };
                    this.handleChoroplethMapEvent();
                });
        } else {
            this.handleMapEvent();
        }
    }

    public componentWillUnmount(): void {
        this.removeMap();
    }

    public setChartRef = (ref: HTMLElement | null): void => {
        this.chartRef = ref;
    };

    public createMap = (): void => {
        const { config, geoData } = this.props;
        const data = geoData.location!.data;
        const { isExportMode = false } = config || {};
        const isViewportFrozen = this.isViewportFrozen();

        this.chart = new mapboxgl.Map({
            ...DEFAULT_MAPBOX_OPTIONS,
            ...getViewportOptions(data, config),
            container: this.chartRef!,
            // If true, the map’s canvas can be exported to a PNG using map.getCanvas().toDataURL().
            // This is false by default as a performance optimization.
            interactive: !isViewportFrozen,
            preserveDrawingBuffer: isExportMode,
        });
    };

    public render(): React.ReactNode {
        const {
            config: { isExportMode = false },
        } = this.props;
        const classNames = cx("s-gd-geo-chart-renderer", "mapbox-container", {
            isExportMode,
            "s-isExportMode": isExportMode,
        });

        return <div className={classNames} ref={this.setChartRef} />;
    }

    private updateMapWithConfig = (prevConfig: IGeoConfig, prevColorStrategy: IColorStrategy): void => {
        if (this.shouldResetMap(prevConfig, prevColorStrategy)) {
            // Config for clustering and pushpin size lead to change layer setting
            // Then calling resetMap here is needed
            this.resetMap();
        }

        this.updatePanAndZoom();
        this.updateViewport(prevConfig);
    };

    private resetMap = (): void => {
        const {
            config: { isChoroplethMap },
        } = this.props;
        this.cleanupMap();
        if (isChoroplethMap) {
            this.setupChoroplethMap();
            this.handleChoroplethMapEvent();
        } else {
            this.setupMap();
        }
    };

    private shouldResetMap = (prevConfig: IGeoConfig, prevColorStrategy: IColorStrategy): boolean => {
        const { colorStrategy, config } = this.props;

        if (isPointsConfigChanged(prevConfig.points, config.points)) {
            return true;
        }

        if (
            isColorAssignmentItemChanged(
                prevColorStrategy.getColorAssignment(),
                colorStrategy.getColorAssignment(),
            )
        ) {
            return true;
        }

        if (config.isChoroplethMap !== prevConfig.isChoroplethMap) {
            return true;
        }

        return false;
    };

    private isViewportFrozen = (): boolean => {
        const { config } = this.props;
        return get(config, "viewport.frozen", false);
    };

    private createMapControls() {
        invariant(this.chart, "illegal state - creating map controls while map not initialized");

        const isViewportFrozen = this.isViewportFrozen();

        this.chart!.addControl(
            new mapboxgl.AttributionControl({
                compact: true,
            }),
        );

        if (!isViewportFrozen) {
            this.addMapControls();
        }
    }

    private removeMapControls = (): void => {
        if (this.navigationControlButton) {
            this.chart!.removeControl(this.navigationControlButton);
            this.navigationControlButton = null;
        }
    };

    private addMapControls = (): void => {
        if (!this.navigationControlButton) {
            this.navigationControlButton = new mapboxgl.NavigationControl({
                showCompass: false,
            });
            this.chart!.addControl(this.navigationControlButton, "bottom-right");
        }
    };

    private toggleMapControls = (): void => {
        const isViewportFrozen = this.isViewportFrozen();
        if (!isViewportFrozen) {
            this.addMapControls();
        } else {
            this.removeMapControls();
        }
    };

    private toggleInteractionEvents = (): void => {
        const isViewportFrozen = this.isViewportFrozen();
        const chart = this.chart;
        if (chart === undefined) {
            return;
        }

        const action = isViewportFrozen ? "disable" : "enable";
        INTERACTION_EVENTS.forEach((interactionEvent: string): void => chart[interactionEvent][action]());
    };

    private updatePanAndZoom = (): void => {
        this.toggleMapControls();
        this.toggleInteractionEvents();
    };

    private updateViewport = (prevConfig: IGeoConfig): void => {
        invariant(this.chart, "illegal state - updating viewport while map not initialized");

        const { config, geoData } = this.props;
        const data = geoData.location!.data;

        const { viewport: prevViewport } = prevConfig;
        const { viewport } = config;
        if (isEqual(prevViewport, viewport)) {
            return;
        }

        const { bounds } = getViewportOptions(data, config);
        if (bounds) {
            this.chart!.fitBounds(bounds, DEFAULT_MAPBOX_OPTIONS.fitBoundsOptions);
        }
    };

    private setFilterMap = (): void => {
        invariant(this.chart, "illegal state - setting filter while map not initialized");

        const {
            config: { selectedSegmentItems = [] },
        } = this.props;

        if (this.chart!.getLayer(DEFAULT_LAYER_NAME)) {
            this.chart!.setFilter(DEFAULT_LAYER_NAME, createPushpinFilter(selectedSegmentItems));
        }
    };

    private handleMapEvent = () => {
        const { chart } = this;

        if (!chart) {
            throw new InvariantError("illegal state - setting map event handlers while map not initialized");
        }

        chart.on("click", DEFAULT_LAYER_NAME, this.handleMapClick);
        chart.on("idle", this.handleMapIdle);
        chart.on("load", this.setupMap);
        chart.on("load", this.adjustChartHeight);
        chart.on("mouseenter", DEFAULT_LAYER_NAME, this.handlePushpinMouseEnter);
        chart.on("mouseleave", DEFAULT_LAYER_NAME, this.handlePushpinMouseLeave);
        chart.on("moveend", this.handlePushpinMoveEnd);
        chart.on("zoomend", this.handlePushpinZoomEnd);
    };

    private handleChoroplethMapEvent = () => {
        const { chart } = this;

        if (!chart) {
            throw new InvariantError("illegal state - setting map event handlers while map not initialized");
        }

        chart.on("click", DEFAULT_CHOROPLETH_LAYER_NAME, this.handleMapClick);
        chart.on("idle", this.handleMapIdle);
        chart.on("load", this.setupChoroplethMap);
        chart.on("load", this.adjustChartHeight);
        chart.on("mousemove", DEFAULT_CHOROPLETH_LAYER_NAME, this.handlePushpinMouseEnter);
        chart.on("mouseleave", DEFAULT_CHOROPLETH_LAYER_NAME, this.handlePushpinMouseLeave);
        chart.on("moveend", this.handlePushpinMoveEnd);
        chart.on("zoomend", this.handlePushpinZoomEnd);
    };

    /*
    Fired after the last frame rendered before the map enters an "idle" state:
        - No camera transitions are in progress
        - All currently requested tiles have loaded
        - All fade/transition animations have completed
    This is called one time only
    */
    private handleMapIdle = (): void => {
        const {
            chart,
            props: { afterRender },
        } = this;
        if (!chart) {
            return;
        }
        chart.off("idle", this.handleMapIdle);
        afterRender();
    };

    private setupMap = (): void => {
        const { chart, handleLayerLoaded, props } = this;

        if (!chart) {
            throw new InvariantError("illegal state - setting up map but with no existing map instance");
        }

        const { colorStrategy, config, geoData } = props;
        const { points: { groupNearbyPoints = true } = {}, showLabels = true } = config || {};

        const hasClustering: boolean = isClusteringAllowed(geoData, groupNearbyPoints);
        const dataSourceProps: IGeoDataSourceProps = {
            colorStrategy,
            config,
            geoData,
            hasClustering,
        };
        chart.addSource(DEFAULT_DATA_SOURCE_NAME, createPushpinDataSource(dataSourceProps));

        if (!hasClustering) {
            chart.addLayer(
                createPushpinDataLayer(DEFAULT_DATA_SOURCE_NAME, geoData, config),
                "state-label", // pushpin will be rendered under state/county label
            );
        } else {
            chart.addLayer(createClusterPoints(DEFAULT_DATA_SOURCE_NAME));
            chart.addLayer(createClusterLabels(DEFAULT_DATA_SOURCE_NAME));
            // un-clustered points will be rendered under state/county label
            chart.addLayer(createUnclusterPoints(DEFAULT_DATA_SOURCE_NAME), "state-label");
        }

        // that config is not public,
        // we only use for storybook to make it is more stable
        if (!showLabels) {
            const { layers = [] } = chart.getStyle();
            layers.forEach((layer: mapboxgl.Layer) => {
                if (layer.id.includes(LAYER_STYLE_LABEL_PREFIX)) {
                    this.removeLayer(layer.id);
                }
            });
        }

        // keep listening to the data event until the style is loaded
        chart.on("data", handleLayerLoaded);
    };

    private setupChoroplethMap = (): void => {
        const { chart, handleLayerLoaded } = this;

        if (!chart || !this.countriesGeo) {
            throw new InvariantError("illegal state - setting up map but with no existing map instance");
        }

        /*const dataSourceProps: IGeoDataSourceProps = {
            colorStrategy,
            config,
            geoData,
            hasClustering,
        };*/
        chart.addSource(DEFAULT_CHOROPLETH_MAP, createChoroplethDataSource(this.countriesGeo));
        chart.addLayer(createChoroplethLayer(DEFAULT_CHOROPLETH_MAP, "case"), "waterway-label");
        chart.addLayer(createChoroplethBorderLayer(DEFAULT_CHOROPLETH_MAP));

        // keep listening to the data event until the style is loaded
        chart.on("data", handleLayerLoaded);
    };

    private adjustChartHeight = () => {
        const { chart, chartRef } = this;

        if (!chartRef || !chart) {
            return;
        }

        const chartHeight: number = chartRef.clientHeight;
        const parentHeight: number = chartRef.parentElement?.clientHeight ?? 0;
        const shouldResize: boolean =
            chartHeight <= ZOOM_CONTROLS_HEIGHT && ZOOM_CONTROLS_HEIGHT <= parentHeight;

        if (shouldResize) {
            // set min height to re-position mapbox attribution and zoom control, in case there are too many top legend items
            // that take all visible height of widget and make geo chart container's height zero
            chartRef.style.minHeight = `${parentHeight}px`;
            chart.resize();
        }
    };

    private handleLayerLoaded = () => {
        const { chart } = this;

        if (!chart || !chart.isStyleLoaded()) {
            return;
        }

        chart.off("data", this.handleLayerLoaded);
    };

    private createTooltip = () => {
        this.tooltip = new mapboxgl.Popup(DEFAULT_TOOLTIP_OPTIONS);
    };

    private cleanupMap = (): void => {
        if (!this.chart) {
            return;
        }

        this.removeLayer(DEFAULT_LAYER_NAME);
        this.removeLayer(DEFAULT_CLUSTER_LAYER_NAME);
        this.removeLayer(DEFAULT_CLUSTER_LABELS_CONFIG.id);
        if (this.chart.getSource(DEFAULT_DATA_SOURCE_NAME)) {
            this.chart.removeSource(DEFAULT_DATA_SOURCE_NAME);
        }
        this.removeLayer(DEFAULT_CHOROPLETH_LAYER_NAME);
        if (this.chart.getSource(DEFAULT_CHOROPLETH_MAP)) {
            this.chart.removeSource(DEFAULT_CHOROPLETH_MAP);
        }
    };

    private removeLayer(layerName: string): void {
        if (!this.chart) {
            return;
        }

        if (this.chart.getLayer(layerName)) {
            this.chart.removeLayer(layerName);
        }
    }

    private removeMap = (): void => {
        if (!this.chart) {
            return;
        }
        // try catch to hide the mapbox's error message
        // TypeError: Cannot read property 'off' of undefined
        // mapbox is trying to call its function after deleted
        // https://github.com/mapbox/mapbox-gl-js/blob/master/src/ui/control/navigation_control.js#L118
        try {
            this.chart.remove();
        } catch {
            return;
        }
    };

    private handlePushpinMoveEnd = (e: mapboxgl.EventData): void => {
        const { target } = e;
        const { onCenterPositionChanged } = this.props;
        const { lng, lat } = target.getCenter();
        const center: IGeoLngLat = { lng, lat };
        onCenterPositionChanged(center);
    };

    private handlePushpinZoomEnd = (e: mapboxgl.EventData): void => {
        const { target } = e;
        const { onZoomChanged } = this.props;
        const zoom: number = target.getZoom();

        onZoomChanged(zoom);
    };

    private handleMapClick = (e: mapboxgl.EventData): void => {
        const {
            config: { viewport },
            drillableItems,
            drillConfig,
            dataView,
            geoData,
        } = this.props;
        const { features, originalEvent } = e;
        const {
            geometry: { coordinates },
            properties,
        } = features[0];

        // Disable drilling in edit/export mode
        if (get(viewport, "frozen", false)) {
            return;
        }

        return handleGeoPushpinDrillEvent(
            drillableItems,
            drillConfig,
            DataViewFacade.for(dataView),
            geoData,
            properties,
            coordinates,
            originalEvent.target,
        );
    };

    private handlePushpinMouseEnter = (e: mapboxgl.EventData): void => {
        const { chart, props, tooltip } = this;
        const { config, drillableItems, intl } = props;
        return handlePushpinMouseEnter(e, chart!, tooltip!, config, drillableItems, intl);
    };

    private handlePushpinMouseLeave = (e: mapboxgl.EventData): void => {
        const { chart, props, tooltip } = this;
        const { config } = props;
        return handlePushpinMouseLeave(e, chart!, tooltip!, config);
    };
}

export default GeoChartRenderer;
