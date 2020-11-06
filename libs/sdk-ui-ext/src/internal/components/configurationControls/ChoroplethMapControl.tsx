// (C) 2020 GoodData Corporation
import React from "react";
import get from "lodash/get";

import { IVisualizationProperties } from "../../interfaces/Visualization";
import CheckboxControl from "./CheckboxControl";

export interface IChoroplethMapControl {
    disabled: boolean;
    properties: IVisualizationProperties;
    pushData: (data: any) => any;
}

function getChoroplethMapProperty(props: IChoroplethMapControl): boolean {
    return get(props, "properties.controls.isChoroplethMap", false);
}

function ChoroplethMapControl(props: IChoroplethMapControl): React.ReactElement {
    const isChoroplethMap = getChoroplethMapProperty(props);
    const { disabled, properties, pushData } = props;
    return (
        <div className="s-choropleth-map-control">
            <CheckboxControl
                valuePath="isChoroplethMap"
                checked={isChoroplethMap}
                labelText="properties.isChoroplethMap"
                properties={properties}
                pushData={pushData}
                disabled={disabled}
            />
            {/* <DropdownControl
                value={area}
                valuePath="viewport.area"
                labelText="properties.viewport.area.title"
                disabled={disabled}
                showDisabledMessage={disabled}
                properties={properties}
                pushData={pushData}
                items={getTranslatedDropdownItems(pushpinViewportDropdownItems, intl)}
            /> */}
        </div>
    );
}

export default ChoroplethMapControl;
