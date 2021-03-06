// (C) 2020 GoodData Corporation
import React from "react";
import cx from "classnames";

interface IMeasureValueButtonProps {
    isActive: boolean;
    buttonTitle: string;
    onClick: () => void;
}

const DropdownButton = ({ isActive, buttonTitle, onClick }: IMeasureValueButtonProps) => {
    const className = cx(
        "gd-mvf-dropdown-button",
        "s-mvf-dropdown-button",
        "gd-button",
        "gd-button-secondary",
        "button-dropdown",
        "icon-right",
        { "icon-navigateup": isActive, "icon-navigatedown": !isActive },
    );

    return (
        <button className={className} onClick={onClick}>
            {buttonTitle}
        </button>
    );
};

export default DropdownButton;
