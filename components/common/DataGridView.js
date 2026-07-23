"use client";

import React from 'react';
import { FlexGridColumn, FlexGrid, FlexGridCellTemplate } from '@grapecity/wijmo.react.grid';
import * as wjcCore from '@grapecity/wijmo';
import { GroupPanel } from '@grapecity/wijmo.react.grid.grouppanel';
import '@grapecity/wijmo.styles/wijmo.css';
import { CellMaker, SparklineMarkers, SparklineType } from '@grapecity/wijmo.grid.cellmaker';
import { FlexGridFilter } from '@grapecity/wijmo.grid.filter'
import * as wjGrid from '@grapecity/wijmo.grid';
import { ExportMode, ScaleMode, FlexGridPdfConverter } from '@grapecity/wijmo.grid.pdf';
import { PdfPageOrientation } from '@grapecity/wijmo.pdf';
import * as gridXlsx from '@grapecity/wijmo.grid.xlsx';
import { ListBox } from '@grapecity/wijmo.react.input';
import { hidePopup, saveFile, Tooltip, PopupPosition } from '@grapecity/wijmo';
import FlexGridContextMenu from './FlexGridContextMenu';
import { Selector } from '@grapecity/wijmo.grid.selector';
import * as schemeHelper from './SchemeHelper';
import Input from './Input';
import Util from './Util';
import { ArabicToLatinNumbers } from './ArabicToLatinNumbers';

const createScheme = (scheme) => {
  if (!scheme || !Array.isArray(scheme.columns)) {
    return { name: 'default', columns: [] };
  }
  return schemeHelper.create(scheme);
};
//import GridGlobalization from './GridGlobalization';
import { FaFlag,FaFlagCheckered } from 'react-icons/fa';
import { Toast } from 'primereact/toast';
import 'primeicons/primeicons.css';
import './DataGridView.scss';
import * as wjSpark from '@grapecity/wijmo.chart.finance.analytics';
// import './DataGridView.css';

const defaultStrings = {
  active: 'نشط',
  inactive: 'موقوف',
  status: 'الحالة',
  postVouchers: { canceled: 'محذوف' },
};

const $ = typeof window !== 'undefined' ? window.$ || { strings: defaultStrings } : { strings: defaultStrings };
$.strings = $.strings || defaultStrings;

export default class DataGridView extends React.Component {
  constructor(props) {
    super(props);
    let dir = "rtl";
    this.columnTooltips = typeof window !== 'undefined'
      ? new Tooltip({
          position: PopupPosition.Above,
          showAtMouse: true,
          showDelay: 600,
          cssClass: 'rtl',
        })
      : null;
    const schemePtr = createScheme(props.scheme);
    this.state = {
      defaultValueFilters: schemeHelper.createFilters(schemePtr),
      summaryReducer: schemeHelper.createSummaryReducer(schemePtr),
      footerRows: schemeHelper.createFooterRows(schemePtr),
      //groupColumn: schemeHelper.createGroupColumn(props.scheme, props.scheme.allowGrouping),
      selection: undefined,
      currentSelection: null,
      _defaultRowHeight: this.props.defaultRowHeight || 50,
      customCell: true,
      narrow: false,
      scaleMode: ScaleMode.ActualSize,
      exportMode: ExportMode.All,
      orientation: PdfPageOrientation.Portrait,
      progress: 0,
      selectedItems: undefined,
      buttonsColumns: this.createButtonsColumns(this.props.scheme),
      isDesktop: typeof window !== 'undefined' ? window.innerWidth > 800 : false,
      hasError: false,
      errorInfo: null,
      searchText: '',
    };
  }

  componentDidCatch(error, info) {
    console.error('[v0] DataGridView caught error:', error, info);
    this.setState({ hasError: true, errorInfo: { error: String(error), info } });
  }

  componentDidUpdate(prevProps) {
    // buttonsColumns wires each button column's onClick into a Wijmo CellMaker template built
    // from the scheme object at the time it was created. Callers commonly rebuild `scheme` in a
    // useMemo keyed on live state (e.g. row data), so the onClick closures captured here can go
    // stale — clicking the button silently runs against whatever state existed when this
    // component first mounted. Rebuilding buttonsColumns whenever the scheme prop actually
    // changes keeps every button column's click handler current.
    if (prevProps.scheme !== this.props.scheme) {
      this.setState({ buttonsColumns: this.createButtonsColumns(this.props.scheme) });
    }

    // selectionMode is only applied once inside initialized() at first mount — a grid whose
    // isReport prop flips later (e.g. a voucher moving from draft to مرحّل without the grid
    // itself remounting) would otherwise keep the stale selection mode indefinitely.
    if (prevProps.isReport !== this.props.isReport && this.flex) {
      this.flex.selectionMode = this.props.isReport ? wjGrid.SelectionMode.Row : wjGrid.SelectionMode.Cell;
    }
  }

  componentDidMount = () => {
    //GridGlobalization();
    
    this.setState(
      {
        _defaultRowHeight: this.flex ? this.flex.rows.defaultSize * 2 : this.state._defaultRowHeight,
      },
      () => this._updateGridLayout()
    );

    if (this.columnPicker) {
      hidePopup(this.columnPicker.hostElement);
    }
    // Register resize handlers by reference (do NOT invoke here).
    // Invoking the handler during mount caused Wijmo assertions in some environments
    // because the grid wasn't fully initialized yet.
    try {
      window.addEventListener('resize', this._updateGridLayout);
      if (this.flex) {
        // FlexGrid.addEventListener(target, type, handler)
        this.flex.addEventListener(window, 'resize', this._updateGridLayout);
      }
    } catch (err) {
      // Defensive fallback: schedule registration on next tick if something goes wrong now.
      console.error('[v0] Failed to attach resize handlers, deferring:', err);
      setTimeout(() => {
        try {
          window.addEventListener('resize', this._updateGridLayout);
          if (this.flex) this.flex.addEventListener(window, 'resize', this._updateGridLayout);
        } catch (e) {
          console.error('[v0] Deferred resize handler registration failed:', e);
        }
      }, 0);
    }

    this.loadGridState();
    window['grid'] = this.flex;
    // Listen for window resize to update predicate (document does not fire resize).
    window.addEventListener('resize', this.updatePredicate);
  };

  componentWillUnmount() {
    try {
      window.removeEventListener('resize', this._updateGridLayout);
      window.removeEventListener('resize', this.updatePredicate);
    } catch (e) {
      /* ignore */
    }

    try {
      if (this.flex && this.flex.removeEventListener) {
        this.flex.removeEventListener(window, 'resize', this._updateGridLayout);
      }
    } catch (e) {
      /* ignore */
    }

    try {
      if (this.filterGrid && this.filterGrid.dispose) {
        this.filterGrid.dispose();
        this.filterGrid = null;
        this.gridFilters = null;
      }
    } catch (e) {
      /* ignore */
    }
  }

  updatePredicate = () => {
    this.setState({ isDesktop: window.innerWidth > 800 });
  };
createButtonsColumns = () => {
    const schemePtr = createScheme(this.props.scheme);
    let columns = schemePtr.columns.filter((col) => !col.visible || col.visible === true);
    let buttonsColumns = [];
    columns.map((col) => {
      if (col.buttonBody && col.buttonBody === 'button') {
        buttonsColumns.push({
          colName: col.name,
          template: CellMaker.makeButton({
            attributes: { title: col.title, style: this.getButtonInlineStyle(col.className) },
            cssClass: this.setButtonClass(col.className, col.iconType),
            click: col.onClick,
          }),
        });
      }
    });
    return buttonsColumns;
  };

  getSerialTemplate = (context) => {
    const rowIndex = context?.row?.index ?? context?.row?.dataIndex ?? context?.row?.rowIndex ?? 0;
    return <span style={{ display: 'block', width: '100%', textAlign: 'center', fontWeight: '600' }}>{rowIndex + 1}</span>;
  };


  dooo = () => {
    this.loadGridState();
  };

  popupHasCalled = () => {
    if (this.props.parent) {
      this.props.parent.popupHasCalled();
    }
  };
  popupHasClosed = () => {
    if (this.props.parent) {
      this.props.parent.popupHasClosed();
    }
  };

  render = () => {
    if (!this.props.scheme || !Array.isArray(this.props.scheme.columns)) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <strong>خطأ في تحميل الجدول</strong>
          <div>DataGridView: لم يتم توفير مخطط صالح للجدول.</div>
        </div>
      );
    }

    const schemePtr = createScheme(this.props.scheme);
    let columns = schemePtr.columns.filter((col) => !col.visible || col.visible === true);
    if (this.state.columns) {
      columns = this.state.columns;
    }
    /*const serialColumn = {
      name: '__serial',
      header: '##',
      width: 60,
      isReadOnly: true,
      sortable: false,
      filterable: false,
      visible: true,
      align: 'center',
      body: 'serial',
    };
    columns = [serialColumn, ...columns.filter((col) => col.name !== '__serial')];*/
    this.filterColumns = [];
    columns.forEach((element) => {
      if (element.name !== '__serial' && element.filterable !== false) this.filterColumns.push(element.name);
    });

    if (this.props.isReport && this.props.pageId) {
      // this.getDefaultReportDesign();//removed by eran, this code send hundreds of request to the server
    }

    

    const filteredItems =
      this.state.columnChooserItemsSource && this.state.columnChooserItemsSource.length > 0
        ? this.state.columnChooserItemsSource.filter((item) => item.header.toLowerCase().includes(this.state.searchText.toLowerCase()))
        : [];
    const height = this.props.containerStyle || {};
    return (
      <div style={height} dir="rtl">
        {this.state.hasError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            <strong>خطأ في تحميل الجدول</strong>
            <div>{this.state.errorInfo?.error || 'Unexpected error'}</div>
          </div>
        )}
        <Toast
          ref={(el) => (this.toastFilter = el)}
          position={'top-left'}
          style={{ top: 100 }}
          onShow={() => this.setState({ isToastActive: true })}
          onHide={() => this.setState({ isToastActive: false })}
        />
        {/* <button onClick={this.dooo}>Load</button> */}
        {schemePtr.filter && !this.props.hideSearch && (
          <div className="p-grid">
            <div className="p-col-12 p-lg-12 p-sm-12" data-testid="grideFilterSearch">
              <Input
                data-testid="grideFilterSearch-Screen"
                style={{ width: '100%' }}
                innerRef={(e) => {
                  this.txtFilter = e;
                }}
                onInput={this.filter.bind(this)}
                placeholder={'$.strings.globalFilter'}
                autoFocus={ this.props.focusFilter ===undefined ? true:this.props.focusFilter}
                value={this.state.filterTextValue}
                onKeyDown={this.onKeyDown}
              />
            </div>
          </div>
        )}
        {schemePtr.allowGrouping && !this.state.narrow && (
          <GroupPanel className="group-panel" grid={this.state.flex} placeholder={$.strings.groupingRow} />
        )}
        <FlexGrid
          id="theGridTallRows"
          ref={this.props.innerRef}
          headersVisibility={this.props.headersVisibility ? this.props.headersVisibility : 'Column'}
          isReadOnly={this.props.isReport ? true : false}
          quickAutoSize={false}
          quickRowHeights={false}
          
          initialized={this.initialized.bind(this)}
          itemsSource={this.props.dataSource}
          {...this.props}
          wordWrap={true}
          allowMerging={true}
          loadingRows={() => this.columnTooltips.dispose()}
          {...(this.props.isReport ? { keyActionEnter: '0' } : {})}
        >
          {this.props.allowDragging && (this.props.allowDragging === 'Rows' || this.props.allowDragging === 'Both') && (
            <FlexGridCellTemplate cellType="RowHeader" template={this.rowHeaderTemplate} />
          )}
          
          {columns.map((col, index) => {
            return (
              <FlexGridColumn
                id="theGridTallRows2"
                key={index}
                name={col.name}
                header={col.header}
                binding={col.name}
                width={col.width}
                multiLine={true}
                isRequired={col.isRequired || false}
                aggregate={col.dataType && (col.dataType === 2 || col.dataType === 'Number') ? Util.getAggregate(col.aggregate) : 'None'}
                allowSorting={schemePtr.sortable && col.sortable !== false}
                visible={col.visible === false ? false : true}
                wordWrap={true}
                autoRowHeights={this.props.dataSource && this.props.dataSource.length < 500 ? true : false}
                isReadOnly={col.isReadOnly ? true : false}
                minWidth={col.minWidth}
                isContentHtml={col.isContentHtml}
                cellTemplate={col.buttonBody === 'button' ? this.createButton(col) : undefined}
                editor={col.editor ? col.editor : undefined}
                align={col.align}
                maxLength={col.maxLength}
                cssClass={col.align && col.align === 'left' ? styles.valueLeftStyle : ''}
                dataType={col.dataType}
                format={col.format}
                isFooterCustomValue={col.isFooterCustomValue}
                footerCustomValue={col.footerCustomValue}
                allowMerging={this.props.allowMerging ? true : false}
              >
                {col.body && col.body === 'serial' && <FlexGridCellTemplate cellType="Cell" template={this.getSerialTemplate} />}
                {col.body && col.body !== 'serial' && <FlexGridCellTemplate cellType="Cell" template={col.body} />}
                {!col.body && this.isStatusColumn(col.name) && (
                  <FlexGridCellTemplate cellType="Cell" template={(cell) => this.getTemplate(cell, col.name)} />
                )}
                {!col.body &&col.name === 'campaign' && (
                  <FlexGridCellTemplate cellType="Cell" template={(cell) => this.getCampaignTemplate(cell, col.name)} />
                )}
                
              </FlexGridColumn>
            );
          })}
          {
            // NOTE: instantiate FlexGridFilter imperatively in `initialized` to avoid
            // the React child handling that tries to mutate props/objects (causing
            // "object is not extensible" errors in some environments).
            // The actual control instance will be created after the grid is
            // initialized (see `initialized` below) and assigned to
            // `this.gridFilters.control` so older code paths continue to work.
          }
        </FlexGrid>
        
        {/* <ListBox initialized={this.initializedPicker.bind(this)} className={`${'column-picker'} ${styles.columnPicker}`} /> */}
        
      </div>
    );
    
  };

  handleHeaderClick = (e) => {
    let grid = this.props.innerRef.current;
    let ht = grid.hitTest(e);
    if (ht.panel === grid.columnHeaders) {
      let colIndex = ht.col;
      this.moveColumnToEnd(grid, colIndex);
    }
  };
  moveColumnToEnd = (grid, colIndex) => {
    let col = grid.columns[colIndex];
    grid.columns.removeAt(colIndex);
    grid.columns.push(col);
  };
  getFilters = () => {
    return this.gridFilters;
  };

  
  onOpenDesigner = () => {
    this.popupHasCalled();
    let schemeData = this.getGridScheme();
    this.setState({ ReportsDesignerVisible: true, schemeData: schemeData });
  };
  onCloseDesigner = () => {
    this.popupHasClosed();
    this.setState({ ReportsDesignerVisible: false });
  };
  onOpenSearchDesigner = () => {
    this.popupHasCalled();
    this.setState({ SearchReportsDesignerVisible: true });
  };


  onSearchDesignerSuccess = (jsonScheme) => {
    this.popupHasClosed();
    if (jsonScheme) {
      this.setState({ SearchReportsDesignerVisible: false });
      let state = JSON.parse(jsonScheme);
      console.log("state ",state)
      if (this.flex && state) {
        let flexGridFilters = this.gridFilters;
        var view = this.flex.collectionView;
        let self = this;
        if (view) {
          try {
            //view.filters = state.filterDefinition;
            view.deferUpdate(function () {
              view.sortDescriptions.clear();
              if (state.sortDescriptions && state.sortDescriptions.length > 0) {
                for (var i = 0; i < state.sortDescriptions.length; i++) {
                  var sortDesc = state.sortDescriptions[i];
                  view.sortDescriptions.push(new wjcCore.SortDescription(sortDesc.property, sortDesc.ascending));
                }
              }
              if (state.filterDefinition && state.filterDefinition.filters && state.filterDefinition.filters.length > 0) {
                let obj = state.filterDefinition;
                if (obj.defaultFilterType) flexGridFilters.control.defaultFilterType = obj.defaultFilterType;
                if (obj.filters) flexGridFilters.control.filters = obj.filters;
                self.gridFilters = flexGridFilters;
              }
            });
          } catch (e) {
            console.log(e);
          }
        }
        let columns = JSON.parse(state.columns);

        this.setState({ columns: [], SearchReportsDesignerVisible: false }, () => {
          this.setState({ columns: columns.columns });
          if(this.props.doHideVisibleCol) this.props.doHideVisibleCol()
        });
      }
    } else {
      this.setState({ SearchReportsDesignerVisible: false });
    }
  };
  onSearchDesignerClose = () => {
    this.popupHasClosed();
    this.setState({ SearchReportsDesignerVisible: false });
  };

  getGridFilter = () => {
    return (
      this.gridFilters &&
      JSON.parse(this.gridFilters.control.filterDefinition).filters.map((filter) => ({
        column: filter.binding,
        values: Object.keys(filter.showValues),
      }))
    );
  };

  rowHeaderTemplate = () => {
    return (
      <i
        data-testid="reOrderRow"
        className="pi pi-bars"
        style={{
          fontSize: '15pt',
          fontWeight: 'bold',
          marginTop: '5px',
          width: '100%',
        }}
        title={$.strings.recordsOrder}
      />
    );
  };
createButton = (col) => {
    if (col.name === '') {
      alert(' Add Column Name');
    }
    let button = this.state.buttonsColumns.find((e) => e.colName === col.name);
    if (button) {
      return button.template;
    }
    return undefined;
  };


createButtonTemplate = (col) => (ctx) => {
  const cell = ctx.cell;
  if (!cell) return;

  cell.innerHTML = '';
  cell.style.display = 'flex';
  cell.style.justifyContent = 'center';
  cell.style.alignItems = 'center';

  const btn = document.createElement('button');
  btn.title = col.title || '';
  // use helper to derive consistent css classes for grid buttons
  btn.className = this.setButtonClass(col.className, col.iconType);
  btn.innerHTML = col.iconType ? `<i class="${col.iconType}"></i>` : col.title;

  // Inline style fallback so colors appear even when global CSS is overridden
  const inline = this.getButtonInlineStyle(col.className);
  if (inline) btn.style.cssText += inline;

  btn.addEventListener('click', (e) => col.onClick?.(ctx.item, e));
  cell.appendChild(btn);
};



  saveGridState(flexGrid, scheme) {
    if (!flexGrid) return;
    let state = {
      columns: JSON.parse(flexGrid.columnLayout).columns,
      sortDescriptions: flexGrid.collectionView.sortDescriptions.map(function (sortDesc) {
        return { property: sortDesc.property, ascending: sortDesc.ascending };
      }),
    };
    localStorage[scheme.name] = JSON.stringify(state);
  }

  getGridScheme = () => {
    if (!this.flex) return;

    let state = {
      columns: this.flex.columnLayout,
      filterDefinition: this.gridFilters ? JSON.parse(this.gridFilters.control.filterDefinition) : undefined,
      sortDescriptions: this.flex.collectionView.sortDescriptions.map(function (sortDesc) {
        return { property: sortDesc.property, ascending: sortDesc.ascending };
      }),
    };
    return JSON.stringify(state);
  };

  loadGridState = () => {
    var json = localStorage.getItem(this.props.scheme.name);
    if (json) {
      let state = JSON.parse(json);
      if (this.flex) {
        var view = this.flex.collectionView;
        if (view) {
          view.deferUpdate(function () {
            view.sortDescriptions.clear();
            for (var i = 0; i < state.sortDescriptions.length; i++) {
              var sortDesc = state.sortDescriptions[i];
              view.sortDescriptions.push(new wjcCore.SortDescription(sortDesc.property, sortDesc.ascending));
            }
          });
        }
        this.setState({ columns: state.columns });
      }
    }
  };

  

  setButtonClass = (className, iconType) => {
    const classes = ['wj-cell-maker-btn'];
    const cls = (className || 'default').toLowerCase();
    const icon = (iconType || '').toLowerCase();

    switch (cls) {
      case 'danger':
        classes.push('btn-danger');
        break;
      case 'warning':
        classes.push('btn-warning');
        break;
      case 'info':
        classes.push('btn-info');
        break;
      case 'success':
        classes.push('btn-success');
        break;
      default:
        classes.push('btn-default');
        break;
    }

    switch (icon) {
      case 'search':
        classes.push('pi', 'pi-search');
        break;
      case 'edit':
        classes.push('pi', 'pi-pencil');
        break;
      case 'delete':
        classes.push('pi', 'pi-trash');
        break;
      case 'add':
        classes.push('pi', 'pi-plus');
        break;
      case 'view':
      case 'eye':
        classes.push('pi', 'pi-eye');
        break;
      case 'save':
        classes.push('pi', 'pi-save');
        break;
      case 'calendar':
        classes.push('pi', 'pi-calendar');
        break;
      case 'money':
        classes.push('pi', 'pi-money-bill');
        break;
      default:
        break;
    }

    return classes.join(' ');
  };

  // Returns inline style string for a given button class to be used as a
  // fallback when CSS rules are overridden or not applied by the environment.
  getButtonInlineStyle = (className) => {
    const cls = (className || 'default').toLowerCase();
    switch (cls) {
      case 'danger':
        return 'background:#dc3545;color:#fff;border:none;';
      case 'warning':
        return 'background:#ffb84d;color:#222;border:none;';
      case 'info':
        return 'background:#17a2b8;color:#fff;border:none;';
      case 'success':
        return 'background:#28a745;color:#fff;border:none;';
      default:
        return 'background:#f1f1f1;color:#222;border:none;';
    }
  };

  // Apply inline colors/styles to any buttons inside the grid host.
  // This is a runtime fallback for environments where external CSS is
  // overridden or CellMaker doesn't propagate classes/styles reliably.
  applyButtonColors = () => {
    try {
      if (!this.flex || !this.flex.hostElement) return;
      const btns = this.flex.hostElement.querySelectorAll('button');
      btns.forEach((btn) => {
        const cls = (btn.className || '').toLowerCase();
        // size and base styles
        btn.style.height = btn.style.height || '30px';
        btn.style.minWidth = btn.style.minWidth || '32px';
        btn.style.padding = btn.style.padding || '0 8px';
        btn.style.borderRadius = btn.style.borderRadius || '8px';
        btn.style.border = btn.style.border || 'none';

        if (cls.indexOf('btn-danger') > -1) {
          btn.style.background = '#dc3545';
          btn.style.color = '#fff';
        } else if (cls.indexOf('btn-warning') > -1) {
          btn.style.background = '#ffb84d';
          btn.style.color = '#222';
        } else if (cls.indexOf('btn-info') > -1) {
          btn.style.background = '#17a2b8';
          btn.style.color = '#fff';
        } else if (cls.indexOf('btn-success') > -1) {
          btn.style.background = '#28a745';
          btn.style.color = '#fff';
        } else if (cls.indexOf('btn-default') > -1 || cls.indexOf('wj-cell-maker') > -1 || cls.indexOf('wj-cell-maker-btn') > -1) {
          // default neutral look
          btn.style.background = '#f1f1f1';
          btn.style.color = '#222';
        }
        // ensure icon color follows button
        const icon = btn.querySelector('i');
        if (icon) icon.style.color = 'inherit';
      });
    } catch (e) {
      /* ignore */
    }
  };

  filter = (e) => {
    try {
      let txt = e.target.value;
      this.setState({ filterTextValue: txt });
      this.doFilterText(txt);
      this.flex.select(0, 0);
    } catch (e) {
      e.toString();
    }
  };

  doFilterText = (txt) => {
    const schemePtr = schemeHelper.create(this.props.scheme);
    txt = (txt + '').trim();
    txt = normalizeArabic(txt);
    let settingDecimail = Util.getSystemSetting(17);
    if (this.flex && this.flex.collectionView) {
      this.flex.collectionView.filter = (item) => {
        let result = false;
        for (let i = 0; i < schemePtr.columns.length; i++) {
          if (schemePtr.columns[i].body !== 'button' /*&& schemePtr.columns[i].visible !== false*/) {
            if (this.flex.columns.getColumn(schemePtr.columns[i].name).visible) {
              let r = item[schemePtr.columns[i].name] + '';
              //console.info('r', r);
              r = normalizeArabic(r);

              if (this.flex.columns.getColumn(schemePtr.columns[i].name).dataType === 4) {
                const gridDate = r.toString().toLowerCase();
                const filterTxt = txt.toLowerCase();

                // let txtAsDt = new Date(txt).toLocaleDateString('en-GB');
                // const rst = txt.length === 0 || r.toString().toLowerCase().indexOf(txt.toLowerCase()) > -1 || (dt===txtAsDt && txtAsDt!=='Invalid Date');
                if (filterTxt.length === 0 || gridDate.includes(filterTxt) || Util.compareDates(r, filterTxt)) {
                  result = true;
                  break;
                }
              }
              if (this.flex.columns.getColumn(schemePtr.columns[i].name).dataType === 2) {
                // number
                let floatValue = parseFloat(r);
                if (floatValue) {
                  floatValue = Math.round(floatValue * Math.pow(10, settingDecimail)) / Math.pow(10, settingDecimail);
                  let txtAsFloat = parseFloat(txt);
                  const rstt = txt.length === 0 || floatValue.toString().toLowerCase().indexOf(txt.toLowerCase()) > -1 || txtAsFloat === floatValue;
                  if (rstt && !txt.startsWith('00')) {
                    result = true;
                    break;
                  }
                }
              }
              const rs = txt.length === 0 || r.toString().toLowerCase().indexOf(txt.toLowerCase()) > -1;
              if (rs) {
                result = true;
                break;
              }
            }
          }
        }

        return txt.length === 0 || result;
      };
    }
    if (this.flex && this.flex.rows.length <= 0 && !this.state.isToastActive)
      Util.showWarningToast(this.toastFilter, $.strings.searchGeneral.generalFilterWarning);
  };

  initialized(flexgrid) {
    this.flex = flexgrid;
    // Defensive init: sometimes Wijmo initializes before the host has layout/size
    // causing assertions. If the host is not sized yet or initialization throws,
    // defer and retry a few times with increasing delay.
    const attempts = this._initAttempts || 0;
    // `schemePtr` needs to be visible after the try/catch below, so declare
    // it in the function scope rather than inside the try block.
    let schemePtr = schemeHelper.create(this.props.scheme);
    try {
      const rect = this.flex && this.flex.hostElement && this.flex.hostElement.getBoundingClientRect && this.flex.hostElement.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        if (attempts < 5) {
          this._initAttempts = attempts + 1;
          const delay = 50 * Math.pow(2, attempts); // 50,100,200,...
          console.warn('[v0] FlexGrid host has no size yet, deferring initialization by', delay, 'ms (attempt', this._initAttempts, ')');
          setTimeout(() => this.initialized(flexgrid), delay);
          return;
        }
      }
    } catch (checkErr) {
      // ignore and proceed to try initialize - we'll catch assertions below
    }

    if (this.flex) {
      try {
      this.flex.rowHeaders.columns[0].allowResizing = false;
      this.flex.selectionMode = this.props.isReport ? wjGrid.SelectionMode.Row : wjGrid.SelectionMode.Cell;
      if (this.props.columnHeaderHeight) this.flex.columnHeaders.rows[0].height = this.props.columnHeaderHeight;
      else this.flex.columnHeaders.rows[0].height = 40;
      this.flex.columns.height = 150;
      // this.flex.autoSizeRow(0, true); header 2 row height
      // add blank row initially
      //this.flex.rows.push(new wjGrid.Row({notes:''}))
      if (this.props.allowDragging === 'Rows' || this.props.allowDragging === 'Both') {
        //this.flex.selectionMode = wjcCore.asEnum(5, wjGrid.SelectionMode);
        //this.flex.allowSorting = false;
      }

      // handles arabic numbers
      this.flex.hostElement.addEventListener('keydown', (e) => {
        if (Util.isArabic(e.key)) {
          this.flex.startEditing();
          ArabicToLatinNumbers(e);
        }
      });

      if (this.props.onKeyDown) {
        this.flex.hostElement.addEventListener('keydown', (e) => {
          // let currentRow = this.flex.selection.row,
          // row = this.flex.rows[currentRow];

          // if(e.keyCode == 13 && currentRow == this.flex.rows.length-1 && row && row.dataItem.notes){
          //     this.flex.collectionView.addNew() // create new item and insert it to the last position
          //     this.flex.startEditing(true,currentRow+1,4) // move selection to next row first editable cell and start editing
          // }
          this.props.onKeyDown(this.flex, e);
        });
      }
      if (this.props.onMouseDown) {
        this.flex.hostElement.addEventListener('mousedown', (e) => {
          this.props.onMouseDown(this.flex, e);
        });
      }
      if (this.props.ShowColumsSpan) {
        var panel = flexgrid.columnHeaders;
        var extraRow = new wjGrid.Row();
        extraRow.allowMerging = true;
        panel.rows.splice(0, 0, extraRow);
        for (let colIndex = this.props.ColumsSpanFrom; colIndex <= this.props.ColumsSpanTo; colIndex++) {
          panel.setCellData(0, colIndex, this.props.ColumsSpanHeader);
        }
      }
      //////////// Add Footer Row

      this.setState({ flex: flexgrid });
      // Create FlexGridFilter imperatively instead of using the React child
      // component to avoid internal mutations of props/objects that can lead
      // to "object is not extensible" runtime errors in some environments.
      try {
        const schemeForFilter = schemeHelper.create(this.props.scheme);
        if (schemeForFilter.filter && !this.filterGrid) {
          const filterCtrl = new FlexGridFilter(flexgrid);
          this.filterGrid = filterCtrl;
          // keep compatibility with code that expects `this.gridFilters.control`.
          this.gridFilters = { control: filterCtrl };
          // Wire up handlers as the React wrapper would
          this.initializedFilter(filterCtrl);
        }
      } catch (e) {
        console.error('[v0] Error creating FlexGridFilter control:', e);
      }
      if (schemePtr.showFooter) {
        this.flex.columnFooters.rows.push(new wjGrid.GroupRow());
        this.flex.bottomLeftCells.setCellData(0, 0, '');

        if (this.props.showStaticFooter) {
          let staticDataRow = new wjGrid.GroupRow();
          staticDataRow.height = 48;
          flexgrid.columnFooters.rows.push(staticDataRow);
        }
      }
      } catch (e) {
        console.error('[v0] Error initializing FlexGrid:', e);
      }
      let narrow = this.flex ? this.flex.hostElement.clientWidth < 500 : false;
      if (this.props.dontConvertToCards) narrow = false;
      let visibleColumns = schemePtr.columns.filter((col) => col.visible === undefined || col.visible === null || col.visible === true);
      if (narrow && visibleColumns && !this.props.dontDoLessThan3 && visibleColumns.length <= 3) {
        narrow = false;
      }
      //////////// Responsive Mode
      this.flex.formatItem.addHandler((s, e) => {
        // columns tooltip
        if (e.panel === s.columnHeaders) {
          let column = schemePtr.columns.find((col) => col.buttonBody !== 'button' && col.name === e.getColumn().name);

          if (column && column.tooltip) {
            let tooltipText = column.tooltip;
            let textAlign = 'right' ;
            let tooltipHtml = "<div style='text-align:" + textAlign + " class='col-header'>" + tooltipText + '</div>';
            this.columnTooltips.setTooltip(e.cell, tooltipHtml);
          }
        }

        // Apply row styling for reports (odd/even rows with better styling)
        if (this.props.isReport && e.panel === s.cells) {
          const rowIndex = e.row;
          const row = s.rows && s.rows[rowIndex];
          const isSelectedRow = !!(row && row.isSelected);
          const isOddRow = rowIndex % 2 === 0; // 0-based index, so even index = odd row number
          const rowElement = e.cell && e.cell.parentElement;

          e.cell.classList.remove('wj-report-row-odd', 'wj-report-row-even', 'wj-report-row-selected');

          if (rowElement) {
            rowElement.classList.remove('wj-report-row-selected');
          }

          if (isSelectedRow) {
            e.cell.classList.add('wj-report-row-selected');
            if (rowElement) rowElement.classList.add('wj-report-row-selected');
          } else if (isOddRow) {
            e.cell.classList.add('wj-report-row-odd');
          } else {
            e.cell.classList.add('wj-report-row-even');
          }
        }

        if (this.props.showStaticFooter && e.panel == s.columnFooters) {
          let columnFooter = schemePtr.columns.find((col) => col.name === e.getColumn().name && col.staticFooter);
          if (columnFooter) {
            if (e.row == 1 && e.getColumn().name === columnFooter.name) {
              e.cell.innerText = columnFooter.staticFooter ? columnFooter.staticFooter : '';
            }
          }
        }

        // show rows as cards on narrow layout

        if (e.panel === s.cells && e.col === schemePtr.responsiveColumnIndex && narrow) {
          let format = this.getColumnReponsive();
          let html = wjcCore.format(format, s.rows[e.row].dataItem);
          e.cell.innerHTML = html;
          let hiddenColCount = 0;

          for (let index = 0; index < schemePtr.columns.length; index++) {
            let col = s.columns[index];

            if (e.row >= 0 && col.binding === 'status') {
              let data = s.getCellData(e.row, col.index);
              if (data + '' === '3') data = '2';

              let newData = data;

              if (data + '' === '1' || data + '' === '2') {
                newData = Util.getStatusName(data);
              }

              let color = '';
              if (newData === $.strings.active || newData + '' === '1') {
                color = 'limegreen';
              } else {
                color = 'red';
              }
              let newHtml =
                '<span style="font-size:18px">' +
                $.strings.status +
                ': ' +
                '<span style="color:' +
                color +
                ';">' +
                newData +
                "<i class='pi pi-flag-fill'/></span></span>";
              let cellHtml = undefined;

              if (data === $.strings.active || data + '' === '1') {
                if (html.includes('<div class="item-detail">' + $.strings.status + ': ' + newData + '</div>')) {
                  cellHtml = html.replace(
                    '<div class="item-detail">' + $.strings.status + ': ' + newData + '</div>',
                    wjcCore.Globalize.format(newHtml, col.format)
                  );
                } else {
                  cellHtml = html.replace(
                    '<div class="item-detail">' + $.strings.status + ': 1</div>',
                    wjcCore.Globalize.format(newHtml, col.format)
                  );
                }
              } else if (data === $.strings.inactive || data + '' === '2') {
                if (html.includes('<div class="item-detail">' + $.strings.status + ': ' + newData + '</div>')) {
                  cellHtml = html.replace(
                    '<div class="item-detail">' + $.strings.status + ': ' + newData + '</div>',
                    wjcCore.Globalize.format(newHtml, col.format)
                  );
                } else
                  cellHtml = html.replace(
                    '<div class="item-detail">' + $.strings.status + ': 2</div>',
                    wjcCore.Globalize.format(newHtml, col.format)
                  );
              }
              e.cell.innerHTML = cellHtml || html;
            } else if (
              html.includes('<div class="item-detail">' + $.strings.status + ': ' + $.strings.active + '</div>') ||
              html.includes('<div class="item-detail">' + $.strings.status + ': 1</div>')
            ) {
              let newHtml =
                '<span style="font-size:18px">' +
                $.strings.status +
                ': ' +
                '<span style="color:limegreen' +
                ';">' +
                $.strings.active +
                "<i class='pi pi-flag-fill'/></span></span>";
              e.cell.innerHTML = html.replace(
                '<div class="item-detail">' + $.strings.status + ': ' + $.strings.active + '</div>',
                wjcCore.Globalize.format(newHtml, col.format)
              );
              e.cell.innerHTML = html.replace(
                '<div class="item-detail">' + $.strings.status + ': 1</div>',
                wjcCore.Globalize.format(newHtml, col.format)
              );
            } else if (
              html.includes('<div class="item-detail">' + $.strings.status + ': ' + $.strings.inactive + '</div>') ||
              html.includes('<div class="item-detail">' + $.strings.status + ': 2</div>')
            ) {
              let newHtml =
                '<span style="font-size:18px">' +
                $.strings.status +
                ': ' +
                '<span style="color:red' +
                ';">' +
                $.strings.inactive +
                "<i class='pi pi-flag-fill'/></span></span>";
              e.cell.innerHTML = html.replace(
                '<div class="item-detail">' + $.strings.status + ': ' + $.strings.inactive + '</div>',
                wjcCore.Globalize.format(newHtml, col.format)
              );
              e.cell.innerHTML = html.replace(
                '<div class="item-detail">' + $.strings.status + ': 2</div>',
                wjcCore.Globalize.format(newHtml, col.format)
              );
            } else if (
              html.includes('<div class="item-detail">' + $.strings.status + ': ' + $.strings.postVouchers.canceled + '</div>') ||
              html.includes('<div class="item-detail">' + $.strings.status + ': 3</div>')
            ) {
              let newHtml =
                '<span style="font-size:18px">' +
                $.strings.status +
                ': ' +
                '<span style="color:red' +
                ';">' +
                $.strings.postVouchers.canceled +
                "<i class='pi pi-flag-fill'/></span></span>";
              e.cell.innerHTML = html.replace(
                '<div class="item-detail">' + $.strings.status + ': ' + $.strings.postVouchers.canceled + '</div>',
                wjcCore.Globalize.format(newHtml, col.format)
              );
              e.cell.innerHTML = html.replace(
                '<div class="item-detail">' + $.strings.status + ': 3</div>',
                wjcCore.Globalize.format(newHtml, col.format)
              );
            }
            var extraRow = new wjGrid.Row();
            extraRow.allowMerging = true;
            //
            // add extra header row to the grid
            //
          }

          hiddenColCount = 0;
          for (let index = 0; index < schemePtr.columns.length; index++) {
            if (schemePtr.columns[index].visible === false) {
              hiddenColCount++;
            } else {
              if (schemePtr.columns[index].buttonBody && schemePtr.columns[index].buttonBody === 'button') {
                let temp = index;
                temp = (temp - hiddenColCount) * 2;
                if (e.cell && e.cell.childNodes && e.cell.childNodes.length > 0 && e.cell.childNodes[temp] != null) {
                  e.cell.childNodes[temp].addEventListener('click', (event) => {
                    this.onButtonClick(event, index, s.rows[e.row].dataItem);
                  });
                }
              }
            }
          }
        }

        if (this.props.isReport) {
          //cells formatting
          if (e.panel === flexgrid.cells) {
            let col = flexgrid.columns[e.col];
            if (col.dataType === 2) {
              let value = flexgrid.getCellData(e.row, e.col, false);

              const _col = this.props.scheme.columns.filter((c) => c.name === col.name);

              if (
                !isNaN(value) &&
                value !== '' &&
                col._hdr !== '##' &&
                col._hdr !== '#' &&
                col.name !== 'ser' &&
                col.name !== 'status' &&
                col.name !== 'code' &&
                !_col[0].withoutFractions
              ) {
                if (value === null) {
                  e.cell.textContent = '';
                } else {
                  value = parseFloat(value); // Convert to a number
                  e.cell.textContent = Util.formatNumber(value, Util.getSystemSetting(17));
                }
              }
            }
          }
          //footer formating
          if (e.panel.cellType === wjGrid.CellType.ColumnFooter) {
            let col = s.columns[e.col];
            if (col.dataType === 2) {
              // 2 : Number type
              let footerValue = e.cell.textContent;

              //if sum
              // Get the sum of the column, treating null/undefined as 0
              if (col.aggregate === 1) {
                footerValue = wjcCore.getAggregate(
                  wjcCore.Aggregate.Sum,
                  this.props.dataSource.map((item) => {
                    if (!item['ser'] || item['ser'] === '') return 0;

                    return Util.parseToNumber(item[col.name]);
                  })
                );
              }

              let value = footerValue; // Get the footer text content
              if (!isNaN(value) && value !== '' && col._hdr !== '##' && col._hdr !== '' && col._hdr !== '#' && col.name !== 'code') {
                value = parseFloat(value); // Convert to a number
                e.cell.textContent = Util.formatNumber(value, Util.getSystemSetting(17));
              }
            }

            //manipulate custom footer text
            const _customFooter = this.props.scheme.columns.filter((c) => c.name === col.name);
            const customFooter = _customFooter && _customFooter.length > 0 ? _customFooter[0] : null;
            if (customFooter && customFooter.isFooterCustomValue) {
              if (col._hdr.trim() !== '') e.cell.textContent = Util.formatNumber(customFooter.footerCustomValue, Util.getSystemSetting(17));
              else e.cell.textContent = customFooter.footerCustomValue;
            }
          }
        }
      });
      // Ensure button colors are applied after initial render/formatting
      try {
        this.applyButtonColors();
      } catch (e) {
        /* ignore */
      }
      //////////// Custome Footer Calculation
      this.flex.itemsSourceChanged.addHandler(() => {
        //this.filter();
        if (schemePtr.showFooter) {
          let columns = schemePtr.columns;
          columns = columns.filter((col) => col.customAggregate === true);
          if (columns && columns.length > 0 && flexgrid.itemsSource) {
            try {
              let total = { hours: 0, minutes: 0 };
              columns.forEach((col) => {
                if (col.dataType === 'Time') {
                  total = { hours: 0, minutes: 0 };
                  flexgrid.itemsSource.forEach(function (item) {
                    let value = item[col.name] || '0:0';
                    var parts = value.split(':');
                    var temp;
                    temp = +parts[1] + total.minutes;
                    total.minutes = temp % 60;
                    total.hours = +parts[0] + total.hours + (temp - total.minutes) / 60;
                  });
                  let transTime = this.zeroPad(total.hours) + ':' + this.zeroPad(total.minutes);

                  if (!transTime.startsWith('Na')) {
                    flexgrid.columnFooters.setCellData(flexgrid.columnFooters.rows.length - 1, schemePtr.columns.indexOf(col), transTime, true);
                  }
                } else if (col.dataType === 'Number' && col.name === 'balance') {
                  let balance = 0;
                  if (col.customAggregateType && col.customAggregateType === 'lastRowValue') {
                    balance = this.props.dataSource[this.props.dataSource.length - 1][col.name];
                    balance = Util.formatNumber(balance, Util.getSystemSetting(17));
                  } else {
                    let objBalance = { credit: 0, debit: 0 };
                    this.props.dataSource._src.forEach(function (item) {
                      let credit = item['credit'] || '0';
                      let debit = item['debit'] || '0';

                      objBalance.credit += parseFloat(credit);
                      objBalance.debit += parseFloat(debit);
                    });
                    balance = objBalance.credit - objBalance.debit;
                  }
                  flexgrid.columnFooters.setCellData(flexgrid.columnFooters.rows.length - 1, schemePtr.columns.indexOf(col), balance, true);
                } else if (col.dataType === 'Number' && (col.name === 'amount_assets' || col.name === 'amount_liabilities')) {
                  let balance = 0;
                  this.props.dataSource.forEach(function (item) {
                    if (item['id'] > 0 && col.name === 'amount_assets') {
                      let amount_assets = item['amount_assets'] || '0';
                      balance += parseFloat(amount_assets);
                    } else if (item['id2'] > 0 && col.name === 'amount_liabilities') {
                      let amount_assets = item['amount_liabilities'] || '0';
                      balance += parseFloat(amount_assets);
                    }
                  });

                  flexgrid.columnFooters.setCellData(flexgrid.columnFooters.rows.length - 1, schemePtr.columns.indexOf(col), balance, true);
                } else if (col.customAggregateType && col.customAggregateType === 'salary_item') {
                  let sumVal = 0;
                  flexgrid.itemsSource._src.forEach(function (item) {
                    if (item.type_id + '' === '1' || item.type_id + '' === '2') {
                      if (!isNaN(item[col.name])) {
                        sumVal += parseFloat(item[col.name]);
                      }
                    } else if (item.type_id + '' === '3') {
                      if (!isNaN(item[col.name])) {
                        sumVal -= parseFloat(item[col.name]);
                      }
                    }
                  });
                  flexgrid.columnFooters.setCellData(flexgrid.columnFooters.rows.length - 1, schemePtr.columns.indexOf(col), sumVal, true);
                } else if (col.customAggregateType && col.customAggregateType === 'item_count') {
                  let sumVal = 0;
                  sumVal = flexgrid.itemsSource.length;
                  flexgrid.columnFooters.setCellData(flexgrid.columnFooters.rows.length - 1, schemePtr.columns.indexOf(col), sumVal, true);
                } else if (col.dataType === 'Number') {
                  let sumVal = 0;
                  this.props.dataSource.forEach(function (item) {
                    if (item.disallow_calc_sum_row !== true) {
                      if (!isNaN(item[col.name])) {
                        sumVal += parseFloat(item[col.name]);
                      }
                    }
                  });

                  flexgrid.columnFooters.setCellData(
                    flexgrid.columnFooters.rows.length - 1,
                    schemePtr.columns.indexOf(col),
                    sumVal.toFixed(Util.getSystemSetting(17)),
                    true
                  );
                }
              });
            } catch (ex) {
              ex.toString();
            }
          }
          if (this.state.filterTextValue) this.doFilterText(this.state.filterTextValue);
        }
        // re-apply button coloring after data changes
        try {
          this.applyButtonColors();
        } catch (e) {}

        this.loadGridState();
        this._updateGridLayout();
      });

      //////////// Context Menu
      if (this.props.showContextMenu !== false && !narrow) {
        new FlexGridContextMenu(
          flexgrid,
          this.props.scheme,
          this.showColumnPicker,
          this.props.exportFileName,
          this.saveGridState,
          Util.checkUserAccess(833) ? this.props.allowExcelExport : false,
          this.onOpenDesigner,
          this.onOpenSearchDesigner,
          this.props.exportHiddenColumns,
        );
      } else if (this.props.copyItemStoreDown  !== false && !narrow) {
        new FlexGridContextMenu(
          flexgrid,
          this.props.scheme,
          this.showColumnPicker,
          this.props.exportFileName,
          this.saveGridState,
          Util.checkUserAccess(833) ? this.props.allowExcelExport : false,
          this.onOpenDesigner,
          this.onOpenSearchDesigner,
          this.props.exportHiddenColumns,
          this.props.copyItemStoreDown,
        );
      }

      if (this.props.checkBoxSelector) {
        this.selector = new Selector(flexgrid, {
          itemChecked: () => {
            this.setState({
              selectedItems: flexgrid.rows.filter((r) => r.isSelected),
            });
          },
        });
      }

      // Double Click
      if (this.props.onRowDoubleClick) {
        flexgrid.hostElement.addEventListener('dblclick', (e) => {
          try {
            if (flexgrid.selection && flexgrid.selection._row > -1) {
              let hti = flexgrid.hitTest(e);
              if (hti.cellType === wjGrid.CellType.Cell && (e.target.classList[0] === 'wj-cell' || e.target.classList.length <= 0)) {
                this.props.onRowDoubleClick(flexgrid.rows[flexgrid.selection._row].dataItem, flexgrid.selection);
              }
            }
          } catch (e) {
            e.toString();
          }
        });
      }

      // Single-click / selection change handler: notify consumer via `onRowClick` when
      // selection changes or when a user clicks a cell. This keeps selection state
      // in sync with higher-level components (e.g., modals that need the selected item).
      if (this.props.onRowClick) {
        try {
          // Selection change (keyboard or programmatic)
          if (flexgrid.selectionChanged && flexgrid.selectionChanged.addHandler) {
            flexgrid.selectionChanged.addHandler(() => {
              try {
                const sel = flexgrid.selection;
                if (sel && sel._row > -1) {
                  const item = flexgrid.rows[sel._row].dataItem;
                  this.props.onRowClick(item, sel);
                } else {
                  this.props.onRowClick(undefined, sel);
                }
              } catch (inner) {
                /* ignore */
              }
            });
          }

          // Click on cell (mouse)
          flexgrid.hostElement.addEventListener('click', (e) => {
            try {
              const ht = flexgrid.hitTest(e);
              if (ht && ht.row > -1) {
                const item = flexgrid.rows[ht.row].dataItem;
                if (item) this.props.onRowClick(item, ht);
              }
            } catch (ex) {
              /* ignore */
            }
          });
        } catch (e) {
          /* ignore */
        }
      }
    }

    if (this.props.columnsCustomMenu) {
      let menu = this.props.columnsCustomMenu();
      flexgrid.menu = menu;
      flexgrid.hostElement.addEventListener(
        'contextmenu',
        (e) => {
          this.props.registerContextMenuEvent(e, flexgrid, flexgrid.menu);
        },
        true
      );
    }
  }

  initializedFilter(filter) {
    this.filterGrid = filter;
    if (this.filterGrid) {
      // editing filter
      this.filterGrid.editingFilter.addHandler((s, e) => {
        if (e.getColumn().binding === 'status') {
          // let vals = [];
          // let valueFilter = s.getColumnFilter("status", true).valueFilter;
          // valueFilter.uniqueValues = null;
          // valueFilter.getUniqueValues().forEach(item => {
          //   item.text + "" === "1" ? vals.push($.strings.active) : vals.push($.strings.inactive);
          // });
          // valueFilter.uniqueValues = vals;
        }
      });

      // filter changing
      this.filterGrid.filterChanged.addHandler((s, e) => {
        this.filterGrid.onFilterApplied(e);
      });
    }
  }

  clearFilters(focusFilter) {
    if (this.flex) {
      this.setState({ filterTextValue: '' }, () => {
        if (this.txtFilter && focusFilter !== false) this.txtFilter.focus();
      });
    }
  }

  focus = () => {
    if (this.flex) this.flex.focus();
  };
  refresh = (fullUpdate) => {
    if (this.flex) this.flex.refresh(fullUpdate);
  };
  select = (row, col) => {
    if (this.flex) this.flex.select(row, col);
  };
  scrollIntoView = (row, col) => {
    if (this.flex) {
      this.flex.scrollIntoView(row, col, false);
      this.flex.scrollPosition = {
        ...this.flex.scrollPosition,
        x: -this.flex.scrollSize.width,
      };
    }
  };
  startEditing = () => {};
  zeroPad = (num) => {
    var str = num.toString();
    if (str.length < 2) {
      str = '0' + str;
    }
    return str;
  };
  getColumnReponsive = () => {
    const schemePtr = schemeHelper.create(this.props.scheme);
    let format = [];
    let columns = schemePtr.columns;
    if (this.state.columns) {
      columns = this.state.columns;
    }
    if (!columns || columns.length <= 0) {
      return;
    }

    for (let index = 0; index < columns.length; index++) {
      if (columns[index].visible === false) {
        continue;
      }
      let col = columns[index];

      let name = col.name;
      let caption = col.header + '';
      if (caption && caption.length > 0) {
        caption += ': ';
      }
      if (this.state.narrow) {
        // Responsive
        let objCol = this.props.scheme.columns.find((e) => e.name === col.name);

        if (objCol && objCol.buttonBody && objCol.buttonBody === 'button') {
          let buttonHtml =
            '<button style="margin-top:10px;margin-bottom:10px;" class=\'' + this.setButtonClass(objCol.className, objCol.iconType) + "'  ";
          buttonHtml += '></button>';
          format.push(buttonHtml);
        } else {
          format.push('<div class="item-detail">' + caption + '{' + name + '}</div>');
        }
      } else {
        if (col.buttonBody && col.buttonBody === 'button') {
          let buttonHtml = '<button style="margin-top:10px;margin-bottom:10px;" class=\'' + this.setButtonClass(col.className, col.iconType) + "' ";
          buttonHtml += '></button>';
          format.push(buttonHtml);
        } else {
          format.push('<div class="item-detail">' + caption + '{' + name + '}</div>');
        }
      }
    }

    let html = format.join(' ');
    return html;
  };

  onButtonClick(e, colIndex, item) {
    const schemePtr = schemeHelper.create(this.props.scheme);
    let ctx = { item: item };
    schemePtr.columns[colIndex].onClick(e, ctx);
  }

  _updateGridLayout = () => {
    const schemePtr = schemeHelper.create(this.props.scheme);
    // show/hide columns
    //let narrow = this.flex ? this.flex.hostElement.clientWidth < 400 && !this.restoreLayout : false;
    let narrow = this.flex && this.flex.hostElement.clientWidth < 500 && !this.restoreLayout;
    if (this.props.dontConvertToCards) narrow = false;
    if (narrow) {
      let columns = schemePtr.columns.filter((col) => col.visible === undefined || col.visible === null || col.visible === true);
      let visibleColumnsCount = columns.length;
      if (visibleColumnsCount <= 3 && this.flex.hostElement.clientWidth > 270) {
        narrow = false;
        return;
      }
    }
    let visibleColumns = schemePtr.columns.filter((col) => col.visible === undefined || col.visible === null || col.visible === true);
    // if (narrow && visibleColumns && visibleColumns.length <= 2) {
    //   narrow = false;
    // }
    if (this.flex) {
      this.flex.columns.forEach((col) => {
        col.visible = col.index === schemePtr.responsiveColumnIndex ? narrow : !narrow;
        if (!narrow) {
          for (let index = 0; index < schemePtr.columns.length; index++) {
            if (schemePtr.columns[index].name === col.name) {
              col.visible = schemePtr.columns[index].visible === false ? false : true;
              break;
            }
          }
        }
      });

      // make rows taller on phone layout
      let columns = schemePtr.columns.filter((col) => col.visible === undefined || col.visible === null || col.visible === true);
      let visibleColumnsCount = schemePtr.columns.length;
      if (columns && columns.length > 0) {
        visibleColumnsCount = columns.length;
      }

      if (narrow) {
        this.flex.rows.defaultSize = this.state._defaultRowHeight * (narrow ? visibleColumnsCount * 1.7 : 1);
        this.flex.rows.defaultSize = this.flex.rows.defaultSize / 1.5;
      } else {
        if (!this.props.defaultRowHeight) {
          this.flex.rows.defaultSize = this.state._defaultRowHeight * (narrow ? visibleColumnsCount + 5 : 1);
        } else {
          this.flex.rows.defaultSize = this.props.defaultRowHeight * (narrow ? visibleColumnsCount + 5 : 1);
        }
      }

      this.flex.headersVisibility = narrow ? 'None' : this.props.headersVisibility ? this.props.headersVisibility : 'Column';
      this.setState({ narrow: narrow });
    }
  };

  getColumns = () => {
    let listOfColumns = [];
    let narrow = this.flex ? this.flex.hostElement.clientWidth < 500 : false;
    if (this.props.dontConvertToCards) narrow = false;

    let objResult = { isMobile: narrow, listOfColumns: [] };
    if (narrow) {
      const schemePtr = schemeHelper.create(this.props.scheme);
      let columns = schemePtr.columns;
      if (this.state.columns) {
        columns = this.state.columns;
      }
      if (!columns || columns.length <= 0) {
        return;
      }

      for (let index = 0; index < columns.length; index++) {
        if (columns[index].visible === false && columns[index].visibleInPrint !== true) {
          continue;
        }
        let col = columns[index];
        let objGridCol = this.flex.columns.find((gridCol) => gridCol.name === col.name);
        if (objGridCol) {
          objGridCol.columnWidth = col.columnWidth;
          listOfColumns.push(objGridCol);
        }
      }
    } else {
      let columns = this.flex.columns; //schemePtr.columns.filter(col => col.visible === undefined || col.visible === null || col.visible === true)
      const schemePtr = schemeHelper.create(this.props.scheme);
      if (schemePtr.columns) {
        for (let i = 0; i < columns.length; i++) {
          let obj = schemePtr.columns.find((e) => e.name === columns[i].name);
          if (obj && (columns[i].visible || obj.visibleInPrint === true)) {
            if (!columns[i].visible && obj.visibleInPrint === true) columns[i].visible = false;
            columns[i].columnWidth = obj.columnWidth;
            listOfColumns.push(columns[i]);
          }
        }
      }
    }
    objResult.listOfColumns = listOfColumns;
    return objResult;
  };

  getGridState = () => {
    return this.flex ? this.flex.hostElement.clientWidth < 500 : false;
  };
  // Print Grid
  printDoc() {
    // create PrintDocument
    let dir = $.strings.dir;
    let doc = new wjcCore.PrintDocument({
      title: 'HR Self-Service',
      copyCss: false, // prevent cross-origin issues in jsfiddle
    });
    doc.addCSS('direction', dir);
    // add CSS explicitly (since we can't use copyCss in jsfiddle)
    doc.append('<link href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css" rel="stylesheet">');
    doc.append('<link href="https://cdn.grapecity.com/wijmo/5.latest/styles/wijmo.min.css" rel="stylesheet">');
    // add some simple text
    doc.append('<div style="direction:' + dir + ';text-align:center ">');
    doc.append('<h1>قائمة الموظفين</h1>');
    doc.append('</div>');
    doc.append('<div style="direction:' + dir + '">');
    doc.append('<p> قائمة الموظفين الخاصة<b> بشركة اسراء للبرمجة والكمبيوتر </b></p>');
    // add a printer-friendly version of a FlexGrid to the document
    doc.append('<p>نابلس شارع فيصل هاتف 2373001 فاكس 2373002</p>');
    doc.append('</div>');
    let tbl = this.renderTable(dir);
    doc.append(tbl);
    // print the document
    doc.print();
  }
  // renders grid as a table
  renderTable(direction) {
    // start table
    let tbl = '<table style="direction:' + direction + ';border:1px solid black;border-collapse: collapse ">';
    // headers
    if (this.flex.headersVisibility & wjGrid.HeadersVisibility.Column) {
      tbl += '<thead style="border:1px solid black">';
      for (let r = 0; r < this.flex.columnHeaders.rows.length; r++) {
        tbl += this.renderRow(this.flex.columnHeaders, r, true);
      }
      tbl += '</thead>';
    }
    // body
    tbl += '<tbody style="border:1px solid black">';
    for (let r = 0; r < this.flex.rows.length; r++) {
      tbl += this.renderRow(this.flex.cells, r, false);
    }
    tbl += '</tbody>';
    // footers
    if (this.flex.columnFooters && this.flex.columnFooters.rows.length > 0) {
      tbl += '<tfoot style="border:1px solid black">';
      for (let r = 0; r < this.flex.columnFooters.rows.length; r++) {
        tbl += this.renderRow(this.flex.columnFooters, r, true);
      }
      tbl += '</tfoot>';
    }
    // done
    tbl += '</table>';

    return tbl;
  }
  renderRow(panel, r, isColumnHeader) {
    let tr = '',
      row = panel.rows[r];
    if (row.renderSize > 0) {
      tr += '<tr>';
      for (let c = 0; c < panel.columns.length; c++) {
        let col = panel.columns[c];
        if (col.renderSize > 0 && !col.cellTemplate) {
          // get cell style, content
          let style = 'width:' + col.renderSize + 'px;';
          if (isColumnHeader) {
            style += 'text-align:center;';
          } else {
            style += 'text-align:' + col.getAlignment() + ';';
          }
          style += 'padding-right: 6px;border:1px solid black;';

          let content = panel.getCellData(r, c, true);
          if (!row.isContentHtml && !col.isContentHtml) {
            content = wjcCore.escapeHtml(content);
          }
          // add cell to row
          switch (panel.cellType) {
            case wjGrid.CellType.ColumnHeader: {
              tr += '<th style="' + style + '">' + content + '</th>';
              break;
            }
            case wjGrid.CellType.ColumnFooter: {
              style += 'bgcolor:Black;color:white;';
              tr += '<th style="' + style + '">' + content + '</th>';
              break;
            }
            default: {
              // show boolean values as checkboxes
              let raw = panel.getCellData(r, c, false);
              if (raw === true) {
                content = '&#9745;';
              } else if (raw === false) {
                content = '&#9744;';
              }
              tr += '<td style="' + style + '">' + content + '</td>';
              break;
            }
          }
        }
      }
      tr += '</tr>';
    }
    return tr;
  }

  // Export Grid To PDF
  exportPDF() {
    FlexGridPdfConverter.export(this.flex, this.props.exportFileName ? this.props.exportFileName : 'FlexGrid.pdf', {
      maxPages: 10,
      exportMode: this.state.exportMode,
      scaleMode: this.state.scaleMode,
      documentOptions: {
        pageSettings: {
          layout: this.state.orientation,
        },
        header: {
          declarative: {
            text: '\t&[Page]\\&[Pages]',
          },
        },
        footer: {
          declarative: {
            text: '\t&[Page]\\&[Pages]',
          },
        },
      },
      styles: {
        cellStyle: {
          backgroundColor: '#ffffff',
          borderColor: '#c6c6c6',
        },
        altCellStyle: {
          backgroundColor: '#f9f9f9',
        },
        groupCellStyle: {
          backgroundColor: '#dddddd',
        },
        headerCellStyle: {
          backgroundColor: '#eaeaea',
        },
      },
    });
  }

  // Export To Excel
  excelExport() {
    let currentDate = new Date();
    let date = currentDate.getFullYear() + '_' + (currentDate.getMonth() + 1) + '_' + currentDate.getDate();
    let time = currentDate.getMinutes() + ' ' + currentDate.getHours() + ' ';
    let dateStr = date + ' ' + time;
    let exportHiddenColumns = this.props.exportHiddenColumns;
    let fileName = this.props.exportFileName ? this.props.exportFileName + ' ' + dateStr : 'FlexGrid.xlsx';
    fileName = fileName.trim();

    this.restoreLayout = true;
    this._updateGridLayout();
    gridXlsx.FlexGridXlsxConverter.saveAsync(
      this.flex,
      {
        includeColumns: function (column) {
          if (exportHiddenColumns) return !column.name.startsWith('btn');
          else return !column.name.startsWith('btn') && column.visible;
        },
        formatItem: this.formatItemXlsx,
      },
      fileName,
      null,
      null,
      (progress) => this.setState({ progress: progress }),
      true
    );

    this.restoreLayout = false;
    this._updateGridLayout();
  }
  //
  cancel() {
    gridXlsx.FlexGridXlsxConverter.cancelAsync(() => this.setState({ progress: 0 }));
  }

  exportCSV() {
    let rng = new wjGrid.CellRange(0, 0, this.flex.rows.length - 1, this.flex.columns.length - 1),
      csv = this.flex.getClipString(rng, wjGrid.ClipStringOptions.CSV, true, false);
    saveFile(csv, this.props.exportFileName ? this.props.exportFileName + '.csv' : 'FlexGrid.csv');
  }

  formatItemXlsx = (args) => {
    let p = args.panel,
      row = args.row,
      col = args.col,
      xlsxCell = args.xlsxCell;
    if (
      p.cellType === wjGrid.CellType.Cell &&
      (p._cols[col].name.toLowerCase() === 'status' || p._cols[col].name.toLowerCase() === 'checkbooksstatus')
    ) {
      let data = this.flex.getCellData(row, col);
      if (data) {
        xlsxCell.value = Util.getStatusName(data);
      }
    } else if (p.cellType === wjGrid.CellType.Cell && this.flex.columns[args.col].dataType === 3) {
      // boolean
      let data = this.flex.getCellData(row, col);
      if (data) xlsxCell.value = $.strings.yes;
      else xlsxCell.value = $.strings.no;
      if(this.props.from_permissions)
      {
        if (data) xlsxCell.value = $.strings.PermissionsUsersAccess.active;
        else xlsxCell.value = $.strings.PermissionsUsersAccess.inactive;
      }
    }
  };

  // Column Picker (Chooser)
  initializedPicker(picker) {
    this.columnPicker = picker;
  }

  showColumnPicker = () => {
    let columnsList = [];
    this.flex.columns.forEach((item) => {
      this.props.scheme.columns.forEach((e) => {
        if (e && e.name + '' === item._name + '' && e.visibleInColumnChooser !== false) {
          columnsList.push(item);
        }
      });
    });
    this.popupHasCalled();
    this.setState({ columnChooserVisible: true, columnChooserItemsSource: columnsList || [] });
  };
  onCloseColumnPicker = () => {
    this.popupHasClosed();
    this.setState({ columnChooserVisible: false });
  };
  selectAll(all = true) {
    if (all) {
      this.columnPicker.control.checkedItems = this.columnPicker.control.itemsSource;
    } else {
      this.columnPicker.control.checkedItems = [];
    }
  }
  onReverseSelection = () => {
    let items = this.columnPicker.control.itemsSource;
    let checkedItems = this.columnPicker.control.checkedItems;
    let checkedItemsNew = [];
    items.forEach((col) => {
      if (!checkedItems.includes(col)) {
        checkedItemsNew.push(col);
      }
    });
    this.columnPicker.control.checkedItems = checkedItemsNew;
  };

  getCurrentRowItem = () => {
    try {
      if (!this.flex.selectedItems) return undefined;
      return this.flex.selectedItems.length > 0 ? this.flex.selectedItems[0] : undefined;
    } catch (e) {
      e.toString();
    }
  };
  onKeyDown = (e) => {
    if (e.keyCode === Util.keyboardKeys.Enter || e.keyCode === Util.keyboardKeys.DownArrow) {
      if (this.flex) this.flex.focus();
      e.preventDefault();
    }
  };

  // Set the template as per the condition.
  getTemplate = (context, binding) => {
    const rawValue = (context.item && context.item[binding] != null) ? String(context.item[binding]) : '';
    const activeLabel = ($?.strings?.active) || 'نشط';
    const inactiveLabel = ($?.strings?.inactive) || 'موقوف';
    const isActive = rawValue === '1' || rawValue === activeLabel;
    const isInactive = rawValue === '2' || rawValue === inactiveLabel;
    const statusLabel = Util.getStatusName(rawValue) || rawValue || '';
    const color = isActive ? 'limegreen' : isInactive ? 'red' : 'orange';

    return (
      <React.Fragment>
        <span style={{ color, fontWeight: 'bold' }}>
          {statusLabel} <FaFlag />
        </span>
      </React.Fragment>
    );
  };
  getCampaignTemplate = (context, binding) => {
    let campaign = context.item[binding] + ''
    return (
      <React.Fragment>
        {campaign === '1' && (
          <span style={{ color: 'limegreen', fontWeight: 'bold' }}>
             <FaFlagCheckered />
          </span>
        )} 
        {campaign === '2' && (
          <span style={{ color: 'red', fontWeight: 'bold' }}>
             <FaFlagCheckered />
          </span>
        )}
        {campaign === '3' && (
          <span style={{ color: 'orange', fontWeight: 'bold' }}>
            <FaFlagCheckered />
          </span>
        )}
      </React.Fragment>
    );
  };
  getTrendTemplate = (context, binding) => {
    return (
      <React.Fragment>
        {CellMaker.makeSparkline({
          itemsSource: context.item.trend,
          chartType: 'Line',
          color: '#007bff',
          markerColor: '#007bff',
          size: 2,
        })}
      </React.Fragment>
    );
  };

  // Check if the column have binding as status or not.
  isStatusColumn = (binding) => {
    return binding === 'status';
  };
}

const normalizeArabic = (text) => {
  if (!text) return '';
  return text
    .replace(/(أ|إ|آ|ى)/g, 'ا')
    .replace(/(ه|ة)/g, 'ا')
    .replace(/(ؤ|و)/g, 'و')
    .replace(/(ى|ي|ئ)/g, 'ي')
    .replace(/[ًٌٍَُِْ]/g, '')
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
};
