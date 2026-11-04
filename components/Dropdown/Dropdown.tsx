import { appDir } from "@/lib/i18n"
import React, { Component, RefObject } from "react";
import styles from "./Dropdown.module.scss";
import { Dropdown as PrimeDropdown } from "primereact/dropdown";
import { DropdownChangeEvent } from 'primereact/dropdown';
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
    FaSearch,
    FaSearchPlus,
    FaAutoprefixer,
    FaSitemap,
    FaTimesCircle,
    FaCheckDouble,
    FaPrint,
    FaLevelDownAlt,
    FaPlus,
    FaUser,
    FaBars,
    FaRegCopy,
} from "react-icons/fa";

interface DropdownOption {
    id?: number | string;
    code?: string;
    status?: number;
    [key: string]: any;
}

interface DropdownProps {
    id?: string;
    caption?: string;
    htmlFor?: string;
    isRequired?: boolean;
    ignoreWidth?: boolean;
    minLabelWidth?: string;
    labelStyle?: React.CSSProperties;
    placeholder?: string;
    isReportFilter?: boolean;
    innerClass?: string;
    tooltip?: string;
    tooltipOptions?: object;
    formErrors?: Record<string, string>;
    innerRef?: RefObject<any>;
    optionLabel?: string;
    optionLabelLang2?: string;
    optionLabelCode?: string;
    options?: DropdownOption[];
    value?: DropdownOption | null;
    withgroup?: boolean;
    isReport?: boolean;
    btn1event?: () => void;
    btn1tooltip?: string;
    btn1icon?: string;
    dataTestid?: string;
    maxWidth?: string;
    onChange?: (e: DropdownChangeEvent) => void;
}

interface DropdownState {
    floatLabel: boolean;
}

export default class Dropdown extends Component<DropdownProps, DropdownState> {
    private drpDownObj: any;

    constructor(props: DropdownProps) {
        super(props);
        document.documentElement.style.setProperty("--dir", "rtl");
        this.state = {
            floatLabel: false,
        };
    }

    handleSassVariable = () => {
        document.documentElement.style.setProperty("--dir", "rtl");
    };

    componentDidMount() {
        document.addEventListener("lang", this.handleSassVariable);
        console.log("this.props ", this.props)
    }

    componentWillUnmount() {
        document.removeEventListener("lang", this.handleSassVariable);
    }

    onChangeDropDown = (e: DropdownChangeEvent) => {
        console.log("innerRef={(el) => (this.drpDownObj = el)}")
        if (this.props.onChange) this.props.onChange(e);

        // focus the dropdown input
        if (this.drpDownObj?.focusInput) this.drpDownObj.focusInput.focus();
    };

    optionsTemplate = (option: DropdownOption) => {

        const option_new = this.truncatedLabel(option);
        const statusColor = option.status && option.status !== 1 ? "green" : "";
        return (
            <div style={{ color: statusColor }} dir={"rtl"}>
                {option_new}
            </div>
        );
    };

    truncatedLabel = (option: DropdownOption): string => {
        if (!option) return "";

        let optionTrun = "";

        // Include code if exists and not "0"
        if (option.code && option.code !== "0") {
            optionTrun += `${option.code} / `;
        }

        // Include additional code label if provided via props
        if (this.props.optionLabelCode && this.props.optionLabelCode !== "0") {
            const codeValue = option[this.props.optionLabelCode];
            if (codeValue) {
                optionTrun += `${codeValue} / `;
            }
        }

        // Include main label
        if (this.props.optionLabel && option[this.props.optionLabel]) {
            optionTrun += option[this.props.optionLabel];
        }

        return optionTrun;
    };

    selectedOptionTemplate = (option: DropdownOption | null, props: any) => {
        if (option) {
            const option_new = this.truncatedLabel(option);
            return (
                <div>
                    <div
                        style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            minHeight: "16px",
                            textOverflow: "ellipsis",
                            maxWidth: this.props.maxWidth || "380px",
                        }}
                    >
                        {option_new}
                    </div>
                </div>
            );
        }
        return <span>{props.placeholder}</span>;
    };

    handleOptions = () => {
        return this.props.options || [];
    };

    render() {
        const {
            caption,
            htmlFor,
            isRequired,
            ignoreWidth,
            minLabelWidth,
            labelStyle,
            withgroup,
            tooltip,
            innerClass,
            placeholder,
            formErrors,
            id,
            dataTestid,
        } = this.props;

        let labelStyleObj: React.CSSProperties = {};
        if (this.props.isReportFilter) labelStyleObj = { display: "flex", width: "100%" };
        if (labelStyle) labelStyleObj = { ...labelStyleObj, ...labelStyle };

        return (
            <div style={labelStyleObj}>
                {caption && (
                    <Label
                        htmlFor={htmlFor}
                        style={{
                            width: !ignoreWidth ? "auto" : "",
                            minWidth: minLabelWidth || "100px",
                        }}
                    >
                        {caption}
                    </Label>
                )}

                {withgroup ? (
                    <div className="p-inputgroup">
                        <PrimeDropdown
                            id={id || "float-input"}
                            data-testid={dataTestid}
                            tooltip={tooltip}
                            style={{ flex: "1", overflow: "hidden", width: "100%" }}
                            className={`${styles.dropDown} ${innerClass || ""}`}
                            {...this.props}
                            tooltipOptions={{ position: "top", style: { direction: appDir() } }}
                            placeholder={placeholder}
                            itemTemplate={this.optionsTemplate}
                            valueTemplate={this.selectedOptionTemplate}
                            resetFilterOnHide
                            options={this.handleOptions()}
                            onChange={this.onChangeDropDown}
                            appendTo="self"  // <-- This fixes the overlay issue
                            filter
                        />
                        <span className="p-inputgroup-addon" style={{ verticalAlign: "bottom" }}>
                            <Button
                                data-testid={dataTestid}
                                onClick={this.props.btn1event}
                            >
                                {this.renderButtonIcon()}
                            </Button>
                        </span>
                    </div>
                ) : (
                    <PrimeDropdown
                        id={id || "float-input"}
                        data-testid={dataTestid}
                        tooltip={tooltip}
                        style={{  width: "100%" }}
                        className={`${styles.dropDown} ${innerClass || ""}`}
                        {...this.props}
                        tooltipOptions={{ position: "top", style: { direction: appDir() } }}
                        placeholder={placeholder}
                        itemTemplate={this.optionsTemplate}
                        valueTemplate={this.selectedOptionTemplate}
                        resetFilterOnHide
                        options={this.handleOptions()}
                        onChange={this.onChangeDropDown}
                    />
                )}

                {formErrors && formErrors[id || ""] && (
                    <div data-testid="requiredMessages" className={styles.errorField}>
                        {formErrors[id || ""]}
                    </div>
                )}
            </div>
        );
    }

    renderButtonIcon = () => {
        const { btn1icon } = this.props;
        switch (btn1icon) {
            case "search":
                return <FaSearch />;
            case "searchPlus":
                return <FaSearchPlus />;
            case "codePrefix":
                return <FaAutoprefixer />;
            case "accountTree":
                return <FaSitemap />;
            case "clear":
                return <FaTimesCircle />;
            case "check":
                return <FaCheckDouble />;
            case "print":
                return <FaPrint />;
            case "enter":
                return <FaLevelDownAlt className={styles.rotateEnterIcon} />;
            case "plus":
                return <FaPlus />;
            case "user":
                return <FaUser />;
            case "bars":
                return <FaBars />;
            case "copy":
                return <FaRegCopy />;
            default:
                return <FaSearch />;
        }
    };
}
