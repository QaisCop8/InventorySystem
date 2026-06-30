"use client";

import React from 'react';
import styles from './MultiSelect.module.scss';
import { MultiSelect as PrimeMultiSelect } from 'primereact/multiselect';
import Label from './Label';
import Util from './Util';
import Button from './Button';
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
  FaSync,
  FaEraser,
} from 'react-icons/fa';

const $ = typeof window !== 'undefined' ? window.$ : { strings: {} };

export default class MultiSelect extends React.Component {
  constructor(props) {
    super(props);
    this.wrapperRef = React.createRef();
    this.state = {
      floatLabel: false,
      isAllSelected: false,
      filteredItems: this.props.options,
      appendToContainer: null
    };
  }

  componentDidMount() {
    const container = this.wrapperRef.current;
    if (container && !this.props.appendTo) {
      this.setState({ appendToContainer: container });
    }
  }
  truncatedLabel = (option) => {

    let option_trun = option.code && !this.props.dontConcatCodeAndName
      ? option.code + ' / ' + option[Util.getNameByUserLanguage(this.props.optionLabel, this.props.optionLabelLang2)]
      : option[Util.getNameByUserLanguage(this.props.optionLabel, this.props.optionLabelLang2)]
    const truncatedLabel = option_trun.length > 45 ? option_trun.substring(0, 45) + '...' : option_trun;
    return truncatedLabel;

  };

  checkAllIsSelected() {
    if (!this.props.parent) {
      return;
    }
    if (!this.props.valueName) {
      return;
    }
    if (this.props.parent.state.isAllSelected)
      document.querySelector(".p-multiselect-header .p-checkbox.p-component .p-checkbox-box")?.classList.add("pi", "pi-check", "p-highlight");
  }

  render() {
    const panelClassName = `${styles.panelClassRight} ${this.props.panelClassName ?? 'invoice-currency-dropdown-panel'}`.trim();
    // const SELECTALLMAXLIMIT = 5000;
    let divlabelStyle = {};
    if (this.props.isReportFilter) divlabelStyle = { display: 'flex', width: '100%', overflow: 'hidden' };
    let labelStyle = { width: !this.props.ignoreWidth ? 'auto' : '', minWidth: this.props.minLabelWidth ? this.props.minLabelWidth : '100px' };
    if (this.props.isReportFilter)
      labelStyle = {
        width: !this.props.ignoreWidth ? 'auto' : '', minWidth: this.props.minLabelWidth ? this.props.minLabelWidth : '100px',
        maxWidth: this.props.maxLabelWidth ? this.props.maxLabelWidth : '100px', height: !this.props.maxLabelheight ? 16.2 : this.props.maxLabelheight
      };

    const wrapperStyle = { ...divlabelStyle, position: 'relative' }
    return (
      <div style={wrapperStyle} ref={this.wrapperRef}>
        {this.props.caption && (
          <Label
            htmlFor={this.props.htmlFor}
            isRequired={this.props.isrequired}
            className="mb-2 block text-sm"
            style={labelStyle}
          >
            {this.props.caption}
          </Label>
        )}

        {this.props.withgroup && (
          <div className="p-inputgroup">
            <PrimeMultiSelect
              style={{ flex: '2', overflow: 'hidden', direction: 'rtl' }}
              dir="rtl"
              id="float-input"
              onShow={() => {
                let x = document.querySelector('.p-inputtext.p-component.p-multiselect-filter');
                if (x) x.focus();
                let mainRect = document.querySelector('.p-virtualscroller.p-multiselect-items-wrapper');
                if (mainRect) mainRect.style.width = '300px';
                this.checkAllIsSelected();
              }}
              ref={this.props.innerRef}
              virtualScroll={true}
              virtualScrollerOptions={{ itemSize: 35 }}
              title={this.props.tooltip}
              className={`${styles.multiselect} invoice-currency-dropdown w-full ${this.props.className || this.props.innerClass || ''}`.trim()}
              {...this.props}
              appendTo={this.props.appendTo ?? this.state.appendToContainer ?? 'self'}
              // showSelectAll={this.props.options&&this.props.options.length>SELECTALLMAXLIMIT && !this.props.showSelectAllAlways ?false:true}
              tooltipOptions={{ position: 'bottom', style: { direction: 'rtl' } }}
              panelClassName={panelClassName}
              itemTemplate={this.itemsTemplate}
              resetFilterOnHide={true}
              onSelectAll={this.props.handleSelectAll ? this.props.handleSelectAll : this.props.parent ? this.handleSelectAll : undefined}
              //options={this.state.filteredItems ?? this.props.options}
              //onFilter={this.onFilter}

            >
              {this.props.children}
            </PrimeMultiSelect>
            <span className="p-inputgroup-addon" style={{ verticalAlign: 'bottom' }}>
              {this.props.btn1event && (
                <Button id={'btn1_' + this.props.id} onClick={this.props.btn1event} tooltip={this.props.btn1tooltip}>
                  {!this.props.btn1icon || this.props.btn1icon === 'search' ? <FaSearch /> : null}
                  {this.props.btn1icon === 'searchPlus' ? <FaSearchPlus /> : null}
                  {this.props.btn1icon === 'codePrefix' ? <FaAutoprefixer /> : null}
                  {this.props.btn1icon === 'accountTree' ? <FaSitemap /> : null}
                  {this.props.btn1icon === 'clear' ? <FaTimesCircle /> : null}
                  {this.props.btn1icon === 'check' ? <FaCheckDouble /> : null}
                  {this.props.btn1icon === 'print' ? <FaPrint /> : null}
                  {this.props.btn1icon === 'enter' ? <FaLevelDownAlt className={styles.rotateEnterIcon} /> : null}
                  {this.props.btn1icon === 'plus' ? <FaPlus /> : null}
                  {this.props.btn1icon === 'user' ? <FaUser /> : null}
                  {this.props.btn1icon === 'eraser' ? <FaEraser /> : null}
                </Button>
              )}
            </span>
          </div>
        )}

        {!this.props.withgroup && (
          <PrimeMultiSelect
            style={{ flex: '1', position: 'relative', direction: 'rtl' }}
            dir="rtl"
            id="float-input"
            onShow={() => {
              let x = document.querySelector('.p-inputtext.p-component.p-multiselect-filter');
              if (x) x.focus();
              let mainRect = document.querySelector('.p-virtualscroller.p-multiselect-items-wrapper');
              if (mainRect) mainRect.style.width = '100%';
              this.checkAllIsSelected();
            }}
            ref={this.props.innerRef}
            virtualScroll={true}
            virtualScrollerOptions={{ itemSize: 35 }}
            title={this.props.tooltip}
            className={`${styles.multiselect} invoice-currency-dropdown w-full ${this.props.className || this.props.innerClass || ''}`.trim()}
            {...this.props}
            appendTo={this.props.appendTo ?? this.state.appendToContainer ?? 'self'}
            filter={this.props.showFilter ?? this.props.filter}
            showSelectAll={this.props.showCheck ?? this.props.showSelectAll}
            display={this.props.showMultiSelect ? 'chip' : this.props.display}
            tooltipOptions={{ position: 'bottom', style: { direction: 'rtl' } }}
            panelClassName={panelClassName}
            itemTemplate={this.itemsTemplate}
            selectedItemsLabel={this.props.value ? '$.strings.items.selectedItemsLabel' + ' ' + this.props.value.length : ''}
            resetFilterOnHide={true}
            onSelectAll={this.props.handleSelectAll ? this.props.handleSelectAll : this.props.parent ? this.handleSelectAll : undefined}
          >
            {this.props.children}
          </PrimeMultiSelect>
        )}
        {this.props.formErrors && this.props.formErrors[this.props.id] && (
          <div data-testid="requiredMessages" className={styles.errorField}>
            {this.props.formErrors[this.props.id]}
          </div>
        )}
      </div>
    );
  }
  searchWordsMatch = (option, searchQuery, filterFields) => {
    const words = searchQuery.trim().toLowerCase().split(/\s+/);

    const combinedText = filterFields
      .map(f => (option[f] || "").toString().toLowerCase())
      .join(" ");

    return words.every(word => combinedText.includes(word));
  };

  onFilter = (event) => {
    const query = (event.filter || "").trim().toLowerCase();
    const options = this.props.options ?? [];

    const filterFields = (this.props.filterBy || "name")
      .split(",")
      .map(f => f.trim());

    let filtered = [];

    if (options.length > 0 && query) {
      filtered = options.filter(option =>
        this.searchWordsMatch(option, query, filterFields)
      );
    } else {
      filtered = options;
    }

    this.setState({ filteredItems: filtered });
  };



  itemsTemplate = (option) => {
    let option_new = this.truncatedLabel(option)
    let statusColor = option.status && option.status !== 1 ? 'red' : '';

    return (
      <div style={{ color: statusColor, direction: 'rtl', textAlign: 'right' }}>
        {option_new}
      </div>
    );
  };

  onFocus = () => {
    this.setState({ floatLabel: true });
  };

  onBlur = () => {
    this.setState({ floatLabel: false });
    //this.props.isRequired && !this.props.value ? this.setState({ showValidationField: true }) : this.setState({ showValidationField: false });
  };

  handleSelectAll = () => {
    if (!this.props.parent) {
      return;
    }
    if (!this.props.valueName) {
      throw new Error('You must pass a parameter that named valueName which is the name of the value of MultiSelect component');
    }
    let allValues = []
    let isAllSelected = true
    if (!this.props.parent.state.isAllSelected) {
      allValues = this.props.options.map((option) => option);
    }
    else isAllSelected = false
    let name = this.props.valueName;
    this.props.parent.setState({ [name]: allValues, isAllSelected: isAllSelected }, () => {
      if (isAllSelected) document.querySelector(".p-multiselect-header .p-checkbox.p-component .p-checkbox-box")?.classList.add("pi", "pi-check", "p-highlight");
      // if(isAllSelected)document.querySelector(".p-multiselect-header .p-checkbox.p-component")?.classList.add("p-highlight");
      // else document.querySelector(".p-multiselect-header .p-checkbox.p-component .p-checkbox-box")?.classList.add("pi", "pi-check");
    })
  };
}
