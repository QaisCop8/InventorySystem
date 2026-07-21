"use client"

import React from "react"
import { Dropdown as PrimeDropdown, type DropdownChangeEvent } from "primereact/dropdown"
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
} from "react-icons/fa"

import styles from "./Dropdown.module.scss"
import Label from "./Label"
import Util from "./Util"
import Button from "./Button"

type DropdownOption = Record<string, any>

type DropdownProps = {
  id?: string
  caption?: string
  htmlFor?: string
  isRequired?: boolean
  ignoreWidth?: boolean
  labelWidth?: string
  minLabelWidth?: string
  labelStyle?: React.CSSProperties
  placeholder?: string
  isReportFilter?: boolean
  innerClass?: string
  tooltip?: string
  formErrors?: Record<string, string>
  innerRef?: React.Ref<any>
  optionLabel?: string
  optionLabelLang2?: string
  optionLabelCode?: string
  optionValue?: string
  options?: DropdownOption[]
  value?: any
  withgroup?: boolean
  isReport?: boolean
  btn1event?: () => void
  btn1tooltip?: string
  btn1icon?: string
  maxWidth?: string
  onChange?: (e: DropdownChangeEvent) => void | Promise<void>
  filter?: boolean
  disabled?: boolean
  appendTo?: "self" | HTMLElement | null
  [key: string]: any
}

type DropdownState = {
  floatLabel: boolean
}

const documentRoot = typeof document !== "undefined" ? document.documentElement : null

export default class Dropdown extends React.Component<DropdownProps, DropdownState> {
  private drpDownObj: any

  constructor(props: DropdownProps) {
    super(props)
    documentRoot?.style.setProperty("--dir", "rtl")
    this.state = { floatLabel: false }
  }

  handleSassVariable = () => {
    documentRoot?.style.setProperty("--dir", "rtl")
  }

  componentDidMount() {
    document.addEventListener("lang", this.handleSassVariable)
  }

  componentWillUnmount() {
    document.removeEventListener("lang", this.handleSassVariable)
  }

  private setDropdownRef = (el: any) => {
    this.drpDownObj = el
    const { innerRef } = this.props
    if (!innerRef) return

    if (typeof innerRef === "function") {
      innerRef(el)
      return
    }

    if ("current" in innerRef) {
      innerRef.current = el
    }
  }

  private focusInnerInput = () => {
    if (this.drpDownObj?.focusInput) {
      setTimeout(() => {
        this.drpDownObj?.focusInput?.focus?.()
      }, 0)
    }
  }

  private handleChange = (e: DropdownChangeEvent) => {
    this.props.onChange?.(e)
    this.focusInnerInput()
  }

  private truncatedLabel = (option: DropdownOption | null | undefined): string => {
    if (!option) return ""

    let optionText = ""

    if (option.code && `${option.code}` !== "0") {
      optionText += `${option.code} / `
    }

    if (this.props.optionLabelCode && `${this.props.optionLabelCode}` !== "0") {
      const codeValue = option[this.props.optionLabelCode]
      if (codeValue) {
        optionText += `${codeValue} / `
      }
    }

    const optionLabel = this.props.optionLabel
    const optionLabelLang2 = this.props.optionLabelLang2
    if (optionLabel) {
      const resolvedLabel = Util.getNameByUserLanguage(optionLabel, optionLabelLang2)
      optionText += option[resolvedLabel] ?? option[optionLabel] ?? ""
    }

    return optionText
  }

  private optionsTemplate = (option: DropdownOption) => {
    const optionText = this.truncatedLabel(option)
    const statusColor = option?.status && option.status !== 1 ? "red" : ""

    return (
      <div style={{ color: statusColor }} dir="rtl">
        {optionText}
      </div>
    )
  }

  private selectedOptionTemplate = (option: DropdownOption | null, props: any) => {
    const selectedOption = option ?? this.findOptionByValue(this.props.value)
    if (!selectedOption) {
      return <span>{props.placeholder}</span>
    }

    const optionText = this.truncatedLabel(selectedOption)
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
          {optionText}
        </div>
      </div>
    )
  }

  private findOptionByValue = (value: any): DropdownOption | null => {
    const { options, optionValue } = this.props
    if (value == null) return null
    if (!optionValue) return typeof value === 'object' ? value : null

    return options?.find((option) => `${option?.[optionValue]}` === `${value}`) ?? null
  }

  private handleOptions = () => {
    const { isReport, options, optionValue, value } = this.props
    if (isReport) return options || []
    if (!options) return []

    return options.filter((item) => {
      if (item.status === undefined || `${item.status}` === "1") return true

      if (optionValue) {
        return `${item[optionValue]}` === `${value}`
      }

      if (value && typeof value === "object" && "id" in value) {
        return `${item.id}` === `${value.id}`
      }

      return false
    })
  }

  private renderButtonIcon = () => {
    switch (this.props.btn1icon) {
      case "searchPlus":
        return <FaSearchPlus />
      case "codePrefix":
        return <FaAutoprefixer />
      case "accountTree":
        return <FaSitemap />
      case "clear":
        return <FaTimesCircle />
      case "check":
        return <FaCheckDouble />
      case "print":
        return <FaPrint />
      case "enter":
        return <FaLevelDownAlt className={styles.rotateEnterIcon} />
      case "plus":
        return <FaPlus />
      case "user":
        return <FaUser />
      case "bars":
        return <FaBars />
      case "copy":
        return <FaRegCopy />
      case "search":
      default:
        return <FaSearch />
    }
  }

  render() {
    const {
      caption,
      htmlFor,
      isRequired,
      ignoreWidth,
      labelWidth,
      minLabelWidth,
      labelStyle,
      isReportFilter,
      withgroup,
      tooltip,
      innerClass,
      placeholder,
      formErrors,
      id,
      optionLabelLang2,
      optionLabel,
      btn1event,
      btn1tooltip,
      children,
      onChange,
      innerRef,
      ...restProps
    } = this.props

    let wrapperStyle: React.CSSProperties = {}
    let innerLabelStyle: React.CSSProperties = {
      width: !ignoreWidth ? "auto" : labelWidth || "",
      minWidth: minLabelWidth || "100px",
    }

    if (isReportFilter) wrapperStyle = { display: "flex", width: "100%" }
    if (labelStyle) wrapperStyle = { ...wrapperStyle, ...labelStyle }

    const dropdownNode = (
      <PrimeDropdown
        {...restProps}
        ref={this.setDropdownRef}
        id={id || "float-input"}
        title={tooltip}
        style={{ width: "100%", overflow: "hidden", ...(withgroup ? { flex: "1" } : {}) }}
        className={`${styles.dropDown} ${innerClass || ""}`}
        onChange={this.handleChange}
        tooltipOptions={{ position: "top", style: { direction: "rtl" } }}
        placeholder={placeholder}
        optionLabel={optionLabel}
        optionLabelLang2={optionLabelLang2 || optionLabel}
        itemTemplate={this.optionsTemplate}
        valueTemplate={this.selectedOptionTemplate}
        resetFilterOnHide
        options={this.handleOptions()}
        panelClassName={restProps.panelClassName}
        appendTo={restProps.appendTo}
      >
        {children}
      </PrimeDropdown>
    )

    return (
      <div className={styles.dropDownWrapper} style={wrapperStyle}>
        {caption && (
          <Label htmlFor={htmlFor} isRequired={isRequired} style={innerLabelStyle}>
            {caption}
          </Label>
        )}

        {withgroup ? (
          <div className="p-inputgroup">
            {dropdownNode}
            <span className="p-inputgroup-addon" style={{ verticalAlign: "bottom" }}>
              <Button onClick={btn1event} tooltip={btn1tooltip} allowFoucs={true}>
                {this.renderButtonIcon()}
              </Button>
            </span>
          </div>
        ) : (
          dropdownNode
        )}

        {formErrors && id && formErrors[id] && (
          <div data-testid="requiredMessages" className={styles.errorField}>
            {formErrors[id]}
          </div>
        )}
      </div>
    )
  }
}