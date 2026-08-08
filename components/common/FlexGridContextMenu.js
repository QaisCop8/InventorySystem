"use client";

import { Menu } from '@grapecity/wijmo.input';
import { CellRange, GroupRow, AllowSorting, ClipStringOptions } from '@grapecity/wijmo.grid';
import { DataType, SortDescription, CollectionViewGroup, PropertyGroupDescription, saveFile } from '@grapecity/wijmo';
import { FlexGridXlsxConverter } from '@grapecity/wijmo.grid.xlsx';
import { FlexGridPdfConverter, ScaleMode } from '@grapecity/wijmo.grid.pdf';
import * as wjGrid from '@grapecity/wijmo.grid';
import Util from './Util';
import './FlexGridContextMenu.css';

const $ = typeof window !== 'undefined' ? window.$ : { strings: {} };

export default class FlexGridContextMenu {
  constructor(
    grid,
    scheme,
    showColumnPicker,
    fileName,
    saveGridState,
    allowExcelExport,
    openDesigner,
    onOpenSearchDesigner,
    exportHiddenColumns,
    copyItemStoreDown ,
    from_permissions
  ) {
    let host = grid.hostElement;
    let menu;
    if (copyItemStoreDown ) {

      menu = this._buildMenuFromInvoice(grid);
      grid.menu = menu;
      host.addEventListener(
        'contextmenu',
        (e) => {
          
          // select the cell/column that was clicked
           let ht = grid.hitTest(e);
          let colIndex = ht.col;
          let cols = grid.columns;
          let col = cols[colIndex];
          switch (ht.panel) {
            case grid.cells:
              grid.select(ht.row, colIndex);
              break;
            default:
              return; // invalid panel
          }
          // show the menu for the current column
          if (grid.selection.col > -1) {
            e.preventDefault(); // cancel the browser's default menu
            if(col.name ==='store_name' && !col.isReadOnly)
            menu.show(e); // and show ours
          }
        },
        true
      );
    } else {
      menu = this._buildMenu(grid, showColumnPicker, fileName, openDesigner, onOpenSearchDesigner, exportHiddenColumns);
      if (allowExcelExport !== false) {
        let exportItems = {
          header: '$.strings.gridExport',
          items: [{ header: '$.strings.excelFileExport', cmd: 'X_XLSX' }],
        };
        menu.itemsSource.push(exportItems);
      }

      if (openDesigner) {
        let designItems = {
          header: '$.strings.reportsDesigner.title',
          items: [
            { header: '$.strings.reportsDesigner.saveDesign', cmd: 'save_design' },
            { header: '$.strings.reportsDesigner.searchDesign', cmd: 'search_design' },
          ],
        };
        menu.itemsSource.push(designItems);
      }
      host.addEventListener(
        'contextmenu',
        (e) => {
          // select the cell/column that was clicked
          let sel = grid.selection,
            ht = grid.hitTest(e),
            row = ht.getRow();
          let colIndex = ht.col;
          switch (ht.panel) {
            case grid.cells:
              // if this is a group header, select the group column
              if (row instanceof GroupRow && row.dataItem instanceof CollectionViewGroup) {
                let gd = row.dataItem.groupDescription;
                if (gd instanceof PropertyGroupDescription) {
                  let col = grid.getColumn(gd.propertyName);
                  if (col && col.index > -1) {
                    colIndex = col.index;
                  }
                }
              }
              grid.select(ht.row, colIndex);
              break;
            case grid.columnHeaders:
              grid.select(sel.row, ht.col);
              break;
            case grid.rowHeaders:
              grid.select(ht.row, sel.col);
              break;
            default:
              return; // invalid panel
          }
          // show the menu for the current column
          if (grid.selection.col > -1) {
            e.preventDefault(); // cancel the browser's default menu
            menu.show(e); // and show ours
          }
        },
        true
      );
    }
  }
  _buildMenu(grid, showColumnPicker, fileName, openDesigner, onOpenSearchDesigner, exportHiddenColumns) {
    let div = document.createElement('div');
    div.dir = 'rtl';
    let menu = new Menu(div, {
      owner: grid.hostElement,
      displayMemberPath: 'header',
      subItemsPath: 'items',
      commandParameterPath: 'cmd',
      dropDownCssClass: 'contextMenuGridRight',
      openOnHover: true,
      closeOnLeave: false,
      itemsSource: [
        {
          header: '$.strings.sort',
          items: [
            { header: '$.strings.ascending', cmd: 'SRT_ASC' },
            { header: '$.strings.descending', cmd: 'SRT_DESC' },
            { header: '$.strings.noSort', cmd: 'SRT_NONE' },
            { header: '-' },
            { header: '$.strings.clearAllSort', cmd: 'SRT_CLR' },
          ],
        },
        { header: '-' },
        { header: '$.strings.pinUnpin', cmd: 'PIN' },
        { header: '-' },
        { header: '$.strings.autoSize', cmd: 'ASZ' },
        { header: '$.strings.autoSizeAll', cmd: 'ASZ_ALL' },
        { header: '$.strings.columnsChooser', cmd: 'Col_CHOOSER' },
        { header: '-' },
        { header: '$.strings.groupUnGroup', cmd: 'GRP' },
        { header: '$.strings.clearAllGroups', cmd: 'GRP_CLR' },
        { header: '-' },
      ],
      command: {
        // enable/disable menu commands
        canExecuteCommand: (cmd) => {
          let view = grid.collectionView,
            col = grid.columns[grid.selection.col];
          switch (cmd) {
            case 'SRT_ASC':
              return col.currentSort !== '+';
            case 'SRT_DESC':
              return col.currentSort !== '-';
            case 'SRT_NONE':
              return col.currentSort !== null;
            case 'SRT_CLR':
              return view.sortDescriptions.length > 0;
            case 'PIN':
              return true; // toggle pin
            case 'ASZ':
            case 'ASZ_ALL':
            case 'Col_CHOOSER':
              return true;
            case 'GRP':
              return col.dataType !== DataType.Number; // don't group numbers
            case 'GRP_CLR':
              return view.groupDescriptions.length > 0;
            default: {
              break;
            }
          }
          return true;
        },
        // execute menu commands
        executeCommand: (cmd) => {
          let view = grid.collectionView,
            cols = grid.columns,
            col = cols[grid.selection.col],
            sd = view.sortDescriptions,
            gd = view.groupDescriptions;
          switch (cmd) {
            case 'SRT_ASC':
            case 'SRT_DESC':
            case 'SRT_NONE':
              if (grid.allowSorting !== AllowSorting.MultiColumn) {
                sd.clear();
              } else {
                for (let i = 0; i < sd.length; i++) {
                  if (sd[i].property === col.binding) {
                    sd.removeAt(i);
                    break;
                  }
                }
              }
              if (cmd !== 'SRT_NONE') {
                sd.push(new SortDescription(col.binding, cmd == 'SRT_ASC'));
              }
              break;
            case 'SRT_CLR':
              sd.clear();
              break;
            case 'PIN': {
              let fCols = grid.frozenColumns;
              if (col.index >= fCols) {
                // pinning
                cols.moveElement(col.index, fCols, false);
                cols.frozen++;
              } else {
                // unpinning
                cols.moveElement(col.index, fCols - 1, false);
                cols.frozen--;
              }
              break;
            }
            case 'ASZ':
              grid.autoSizeColumn(col.index);
              break;
            case 'ASZ_ALL':
              grid.autoSizeColumns(0, grid.columns.length - 1);
              break;
            case 'Col_CHOOSER': {
              if (showColumnPicker) {
                showColumnPicker();
              }
              break;
            }
            case 'GRP':
              // remove group
              for (let i = 0; i < gd.length; i++) {
                if (gd[i].propertyName === col.binding) {
                  gd.removeAt(i);
                  return; // we're done
                }
              }
              // add group
              gd.push(new PropertyGroupDescription(col.binding));
              break;
            case 'GRP_CLR':
              gd.clear();
              break;
            // export
            case 'X_CSV':
              {
                let rng = new CellRange(0, 0, grid.rows.length - 1, grid.columns.length - 1),
                  csv = grid.getClipString(rng, ClipStringOptions.CSV, true, false);
                let fName = 'FlexGrid.csv';
                if (fileName && fileName.length > 0) {
                  let currentDate = new Date();
                  let date = currentDate.getFullYear() + '_' + (currentDate.getMonth() + 1) + '_' + currentDate.getDate();
                  let time = currentDate.getMinutes() + ' ' + currentDate.getHours() + ' ';
                  let dateStr = date + ' ' + time;
                  fName = fileName + '_' + dateStr;
                }
                saveFile(csv, fName);
              }
              break;
            case 'X_XLSX':
              {
                let fName = 'FlexGrid.xlsx';
                if (fileName && fileName.length > 0) {
                  let currentDate = new Date();
                  let date = currentDate.getFullYear() + ' ' + (currentDate.getMonth() + 1) + ' ' + currentDate.getDate();
                  let time = currentDate.getMinutes() + ' ' + currentDate.getHours() + ' ';

                  let dateStr = date + ' ' + time;
                  fName = fileName + ' ' + dateStr;
                  fName = fName.trim();
                }
                FlexGridXlsxConverter.saveAsync(
                  grid,
                  {
                    includeColumns: function (column) {
                      if (exportHiddenColumns) return !column.name.startsWith('btn');
                      else return !column.name.startsWith('btn') && column.visible;
                    },
                    formatItem: (e) => this.formatItemXlsx(e, grid),
                  },
                  fName
                );
              }
              break;
            case 'X_PDF': {
              let fName = 'FlexGrid.pdf';
              if (fileName && fileName.length > 0) {
                fName = fileName + '_' + new Date().toLocaleDateString();
              }
              FlexGridPdfConverter.export(grid, fName, {
                maxPages: 10,
                scaleMode: ScaleMode.PageWidth,
                documentOptions: {
                  compress: true,
                  header: { declarative: { text: '\t' + fileName } /*{ text: '\t&[Page] of &[Pages]' }*/ },
                  footer: { declarative: { text: '\t&[Page] of &[Pages]' } },
                  info: { author: 'GrapeCity', title: 'FlexGrid' },
                },
                styles: {
                  cellStyle: { backgroundColor: '#ffffff', borderColor: '#c6c6c6' },
                  altCellStyle: { backgroundColor: '#f9f9f9' },
                  groupCellStyle: { backgroundColor: '#dddddd' },
                  headerCellStyle: { backgroundColor: '#eaeaea' },
                },
              });
              break;
            }
            case 'save_design': {
              openDesigner();
              break;
            }
            case 'search_design': {
              onOpenSearchDesigner();
              break;
            }
            default: {
              break;
            }
          }
          // restore focus to active grid cell (TFS 439964)
          grid.refresh();
          let sel = grid.selection,
            cell = grid.cells.getCellElement(sel.row, sel.col);
          if (cell) {
            cell.focus();
          }
        },
      },
    });
    // done
    return menu;
  }
  _buildMenuFromInvoice(grid) {
    let div = document.createElement('div');
    div.dir = 'rtl';
    let menu = new Menu(div, {
      owner: grid.hostElement,
      displayMemberPath: 'header',
      subItemsPath: '',
      commandParameterPath: 'cmd',
      dropDownCssClass: 'contextMenuGridRightInvoice',
      openOnHover: true,
      closeOnLeave: false,
      itemsSource: [{ header: 'نسخ للأسفل', cmd: 'copyStoreToDownRow' }],
      command: {
        canExecuteCommand: (cmd) => {
          return true;
        },
        executeCommand:async (cmd) => {
          switch (cmd) {
                case 'copyStoreToDownRow': {
              if (grid && typeof grid.finishEditing === 'function') grid.finishEditing();
              setTimeout(async() => {
              let view = grid.collectionView,
                cols = grid.columns,
                col = cols[grid.selection.col];
              if (col.name === 'store_name' && !col.isReadOnly) {
                let sel = grid.selection;
                let sourceRowIndex = sel.row;
                let sourceValue = view.items[sourceRowIndex][col.binding];
                // Apply value to all rows below the selected one
                let storeList = await this.getStores();
                for (let i = sourceRowIndex + 1; i < view.items.length; i++) {
                  view.items[i][col.binding] = sourceValue;
                  if(storeList){
                    let storeObj =  storeList.find((element) => element.name === sourceValue);
                    view.items[i]['store_id'] = storeObj.id;
                  }
                }
                // Notify the grid that the data has changed
                view.refresh();
              }
              }, 200);
              break;
            }

            default: {
              break;
            }
          }
          // restore focus to active grid cell (TFS 439964)
          grid.refresh();
          let sel = grid.selection,
            cell = grid.cells.getCellElement(sel.row, sel.col);
          if (cell) {
            cell.focus();
          }
        },
      },
    });
    // done
    return menu;
  }
  formatItemXlsx = (args, grid) => {
    let p = args.panel,
      row = args.row,
      col = args.col,
      xlsxCell = args.xlsxCell;
    if (
      p.cellType === wjGrid.CellType.Cell &&
      (p._cols[col].name.toLowerCase() === 'status' || p._cols[col].name.toLowerCase() === 'checkbooksstatus')
    ) {
      let data = grid.getCellData(row, col);
      if (data) {
        xlsxCell.value = Util.getStatusName(data);
      }
    }
    else if (p.cellType === wjGrid.CellType.Cell && p._cols[col].dataType === 3) {
          // boolean
          let data = grid.getCellData(row, col);
          if (data) xlsxCell.value = '$.strings.yes';
          else xlsxCell.value = '$.strings.no';
          if(p._cols[col].name.toLowerCase() === 'is_granted')
          {
            if (data) xlsxCell.value = '$.strings.PermissionsUsersAccess.active';
            else xlsxCell.value = '$.strings.PermissionsUsersAccess.inactive';
          }
        }
  };
    
}
