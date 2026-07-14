"use client";

import aesjs from 'aes-js';
import { confirmDialog } from 'primereact/confirmdialog';

const $ = typeof window !== 'undefined' ? window.$ : { strings: {}, dbName: '', dbId: '' };

Date.prototype.toJSON = function () {
  var timezoneOffsetInHours = -(this.getTimezoneOffset() / 60); //UTC minus local time
  var sign = timezoneOffsetInHours >= 0 ? '+' : '-';
  var leadingZero = Math.abs(timezoneOffsetInHours) < 10 ? '0' : '';

  //It's a bit unfortunate that we need to construct a new Date instance
  //(we don't want _this_ Date instance to be modified)
  var correctedDate = new Date(
    this.getFullYear(),
    this.getMonth(),
    this.getDate(),
    this.getHours(),
    this.getMinutes(),
    this.getSeconds(),
    this.getMilliseconds()
  );
  timezoneOffsetInHours *= -1;
  correctedDate.setHours(this.getHours() + timezoneOffsetInHours);
  var iso = correctedDate.toISOString().replace('Z', '');
  return iso + sign + leadingZero + Math.abs(timezoneOffsetInHours).toString() + ':00';
};

const createPathRelateiveWithDb = (path) => {
  if (path.startsWith('~')) return `/${path.substring(1)}`;
  let url = `/${$.dbName}/${$.dbId}`;
  if (!path.startsWith('/')) {
    url += '/';
  }
  url += path;
  return url;
};
const exportDefault = {
  groupBy: (array, key, value) => {
    return array.reduce(function (prev, cur) {
      (prev[cur[key]] = prev[cur[key]] || []).push(cur[value]);
      return prev;
    }, {});
  },

  goTo: (path, state) => {
    window.$.history.push(createPathRelateiveWithDb(path), state);
  },
  goToWithoutReload: (path, state) => {
    window.history.replaceState(null, '', createPathRelateiveWithDb(path));
  },
  goToNewTab: (path, args) => {
    const newWindow = window.open(createPathRelateiveWithDb(path), '_blank');

    if (args) {
      //by ahmad eran
      //to pass paramters to the new window, write the following code in the new window
      //in didmount function, write the following code:
      //    window.addEventListener("message", this.receiveMessage, false);
      //in didmount function in setState function second parameter, write the following code:
      //    () => {document.reallyCompleted = "true";}
      //in componentWillUnmount function, write the following code:
      //    window.removeEventListener('message', this.receiveMessage);
      //add the following function to the new window class:
      //    receiveMessage = (event) => {
      //      if (event.origin === window.origin) {
      //      const receivedData = event.data;
      //      // Do something with receivedData
      //    }
      // }
      //the passed data will be in event.data

      const interval = setInterval(() => {
        if (newWindow && newWindow.closed) {
          clearInterval(interval);
        } else if (newWindow && newWindow.document.reallyCompleted === 'true') {
          clearInterval(interval);
          if (newWindow) {
            newWindow.postMessage(args, window.origin);
          }
        }
      }, 1000); // Check every 1 second
    }
  },
  convertArrayToPairs(arr) {
    let _rslt = {};
    arr.forEach((e) => {
      if (e.default_value === 0) e.default_value = false;
      if (e.default_value === 1) e.default_value = true;

      _rslt[e.filter_name] = e.default_value;
    });
    return _rslt;
  },
  getAccountsheetPath(type) {
    switch (type) {
      case 0:
      case 1:
        return 'Reports/AccountSheetReport/';
      case 2:
      case 4:
        return 'Reports/AccountSheetReportCust/';
      case 3:
        return 'Reports/AccountSheetReportSup/';
      case 6:
        return 'Reports/AccountSheetReportEmp/';
    }
    return 'Reports/AccountSheetReport/';
  },
  getYearFirstDay(year) {
    return new Date(year, 0, 1);
  },
  showInfoMsg(msgObj, msgText) {
    try {
      if (!msgText) msgText = $.strings.operationDone;
      if (msgObj) {
        msgObj.replace({
          severity: 'info',
          summary: '',
          detail: msgText,
          sticky: false,
        });
      } else
        msgObj.show({
          severity: 'info',
          summary: '',
          detail: msgText,
          sticky: false,
        });
    } catch (e) { }
  },
  showInfoMessage(msgObj, msgText) {
    if (!msgText) msgText = $.strings.operationDone;
    if (msgObj.current) {
      msgObj.current.replace({
        severity: 'info',
        summary: '',
        detail: msgText,
        sticky: false,
      });
    } else
      msgObj.current.show({
        severity: 'info',
        summary: '',
        detail: msgText,
        sticky: false,
      });
  },
  handleUserInput(e, parent) {
    const name = e.target.id;
    const value = e.target.value;
    parent.dontFocusDate = true;
    parent.setState({ [name]: value });
  },
  handleUserInputWithCallback(e, parent, callback) {
    const name = e.target.id;
    const value = e.target.value;
    parent.dontFocusDate = true;
    parent.setState({ [name]: value }, () => {
      if (callback !== null && callback !== undefined) callback();
    });
  },
  showErrorMsg(msgObj, msgText) {
    try {
      if (!msgText) msgText = 'فشلت العملية';
      if (msgObj) {
        msgObj.replace({
          severity: 'error',
          sumary: '',
          detail: msgText,
          sticky: true,
        });
      } else
        msgObj.show({
          severity: 'error',
          summary: '',
          detail: msgText,
          sticky: true,
        });
    } catch (e) { }
  },
  showSuccessMsg(msgObj, msgText) {
    try {
      if (!msgText) msgText = 'تمت العملية بنجاح';
      if (msgObj) {
        msgObj.replace({
          severity: 'success',
          summary: '',
          detail: msgText,
          sticky: false,
        });
      } else
        msgObj.show({
          severity: 'success',
          summary: '',
          detail: msgText,
          sticky: false,
        });
    } catch (e) { }
  },
  showErrorMessage(msgObj, msgText) {
    try {
      // Default message if none provided
      if (!msgText) msgText = (window.$ && $.strings && $.strings.operationFailed) || 'Operation failed';

      // Ensure the ref exists
      if (msgObj && msgObj.current) {
        msgObj.current.show({
          severity: 'error',
          summary: '', // Correct spelling
          detail: msgText,
          sticky: true,
          life: 3000,
        });
      } else {
        msgObj.current.show({
          severity: 'error',
          summary: '', // Correct spelling
          detail: msgText,
          sticky: true,
          life: 3000,
        });
      }
    } catch (e) {
      console.error('Failed to show error message', e);
    }
  },
  showSuccessMessage(msgObj, msgText) {
    try {
      if (!msgText) msgText = 'تمت العملية بنجاح';
      if (msgObj) {
        msgObj.current.replace({
          severity: 'success',
          summary: '',
          detail: msgText,
          sticky: false,
        });
      } else
        msgObj.current.show({
          severity: 'success',
          summary: '',
          detail: msgText,
          sticky: false,
        });
    } catch (e) { }
  },
  userTypeEnum: {
    user: 1,
    superAdmin: 2,
    admin: 3,
  },
  voucherSaveOperationEnum: {
    save: 1,
    approve: 2,
    approveThenPrint: 3,
    saveThenPayBill: 4,
    cancel: 5,
  },
  voucherInOutEnum: {
    in: 1,
    out: 2,
    inOut: 3,
  },
  screenDesign: {
    linear: 1, // طولي
    cross: 2, // عرضي
  },
  voucherItemDangerousEnum: {
    allow: 1,
    alert: 2,
    stopped: 3,
  },
  showWarningMsg(msgObj, msgText) {
    if (!msgText) msgText = $.strings.operationDone;
    if (msgObj) {
      msgObj.replace({
        severity: 'warn',
        summary: '',
        detail: msgText,
        sticky: true,
      });
    } else
      msgObj.show({
        severity: 'warn',
        summary: '',
        detail: msgText,
        sticky: true,
      });
  },
  adjustCode(code, codeLen) {
    let prefix = '';
    if (!code || code.trim().length === 0) return '';
    for (let i = code.length - 1; i >= 0; i--) {
      if (isNaN(code[i])) {
        prefix = code.substring(0, i + 1);
        break;
      }
    }
    code = code.replace(prefix, '');
    if (!codeLen) codeLen = 9;
    let tempCode = '';
    if (prefix && prefix.length) {
      codeLen = codeLen - prefix.length;
    }
    for (let i = code.length; i < codeLen; i++) {
      tempCode += '0';
    }
    prefix = prefix.toUpperCase();
    tempCode = prefix ? prefix + tempCode + code : tempCode + code;
    return tempCode;
  },
  adjustCodeZ(code, codeLen) {
    let prefix = '';
    if (!code || code.trim().length === 0) return '';
    for (let i = code.length - 1; i >= 0; i--) {
      if (isNaN(code[i])) {
        prefix = code.substring(0, i + 1);
        break;
      }
    }
    code = code.replace(prefix, '');
    if (!codeLen) codeLen = 9;
    let tempCode = '';
    if (prefix && prefix.length) {
      codeLen = codeLen - prefix.length;
    }
    for (let i = code.length; i < codeLen; i++) {
      tempCode += 'Z';
    }
    prefix = prefix.toUpperCase();
    tempCode = prefix ? prefix + tempCode + code : tempCode + code;
    return tempCode;
  },
  adjustCodePlusOne(code, codeLen) {
    let prefix = '';
    if (!code || code.trim().length === 0) return '';
    for (let i = code.length - 1; i >= 0; i--) {
      if (isNaN(code[i])) {
        prefix = code.substring(0, i + 1);
        break;
      }
    }
    let sumLength = 0;
    code = code.replace(prefix, '');
    let value = parseInt(code);
    value = value + 1;
    sumLength = value.toString().length;
    if (!codeLen) codeLen = 8;
    if (codeLen === 1) codeLen = 0;
    let tempCode = '';

    codeLen = codeLen - (prefix.length + sumLength);
    tempCode = value;
    for (let i = codeLen; i > 0; i--) {
      tempCode = '0' + tempCode;
    }
    tempCode = prefix ? prefix + tempCode : tempCode;
    return tempCode;
  },
  Inc_Code(code, prefix) {
    let codeValue = code.replace(prefix, '');
    let code2 = codeValue.split('');
    let i = code2.length - 1;

    while (i > 0 && code2[i] === ' ') {
      i--;
    }

    if (code2[i] === '9') {
      while (code2[i] === '9' && i > 0) {
        code2[i] = '0';
        i--;
      }
      if (code2[i] === '9') {
        code2[i] = 'A';
      } else {
        code2[i] = String.fromCharCode(code2[i].charCodeAt(0) + 1);
      }
    } else {
      if (code2[i] === '9') {
        code2[i] = 'A';
      } else {
        code2[i] = String.fromCharCode(code2[i].charCodeAt(0) + 1);
      }
    }

    // Join the array back to a string
    let newCode = code2.join('');
    newCode = prefix + newCode;
    return newCode;
  },
  getStatusId(statusName) {
    switch (statusName) {
      case $.strings.active: {
        return 1;
      }
      case $.strings.inactive: {
        return 2;
      }
      default: {
        return -1;
      }
    }
  },
  getStatusName(statusId) {
    switch (statusId) {
      case 1: {
        return $.strings.active;
      }
      case 2: {
        return $.strings.inactive;
      }
      case 3: {
        return $.strings.VoucherSearch.deleted;
      }
      default: {
        return '';
      }
    }
  },
  getAccountType() {
    let data = [
      { label: $.strings.all, value: -1 },
      { label: 'الحسابات المحاسبية', value: 0 },
      { label: 'الحسابات غير المحاسبية', value: 1 },
      { label: 'الالعملاء', value: 2 },
      { label: 'الموردين', value: 3 },
      { label: 'المندوبين', value: 4 },
      { label: 'المشتركين', value: 5 },
    ];
    return data;
  },
  getCurrentDate(separator = '') {
    if (!separator || separator.length === 0) separator = '/';
    let newDate = new Date();
    let date = newDate.getDate();
    let month = newDate.getMonth() + 1;
    let year = newDate.getFullYear();

    let d = new Date(year, month - 1, date, 0, 0, 0, 0);
    return d.toLocaleDateString('en-Us');
  },
  getCurrentDateNewFormate(separator = '', dateToFormate) {
    if (!separator || separator.length === 0) separator = '/';
    let newDate = dateToFormate ? dateToFormate : new Date();

    if (newDate instanceof Date);
    else {
      newDate = new Date(newDate);
    }


    let date = newDate.getDate().toString().padStart(2, '0');
    let month = (newDate.getMonth() + 1).toString().padStart(2, '0');
    let year = newDate.getFullYear();

    return `${date}${separator}${month}${separator}${year}`;
  },
  getCurrentDateTime(separator = '') {
    if (!separator || separator.length === 0) separator = '/';
    let newDate = new Date();
    let date = newDate.getDate();
    let month = newDate.getMonth() + 1;
    let year = newDate.getFullYear();
    let hours = newDate.getHours();
    let minutes = newDate.getMinutes();
    let seconds = newDate.getSeconds();

    //return `${year}${separator}${month < 10 ? `0${month}` : `${month}`}${separator}${date < 10 ? `0${date}` : `${date}`}${' '}${hours}${':'}${minutes}${':'}${seconds} `
    let d = new Date(year, month - 1, date, hours, minutes, seconds, 0);
    return d.toLocaleString();
  },
  getCostCenterStatusList() {
    let result = [];
    result.push(
      { id: 1, name: $.strings.chartOfAccount.costCenterOptional },
      { id: 2, name: $.strings.chartOfAccount.costCenterRequired },
      { id: 3, name: $.strings.chartOfAccount.costCenterNotAllowed }
    );
    return result;
  },
  getCostCenterStatusName(id) {
    switch (id) {
      case 1:
        return $.strings.chartOfAccount.costCenterOptional;
      case 2:
        return $.strings.chartOfAccount.costCenterRequired;
      case 3:
        return $.strings.chartOfAccount.costCenterNotAllowed;
      default: {
        break;
      }
    }
    return '';
  },
  getDifferentCurrTransList() {
    return [
      { name: $.strings.chartOfAccount.differentCurrTransVal1, code: 1 },
      { name: $.strings.chartOfAccount.differentCurrTransVal2, code: 2 },
      { name: $.strings.chartOfAccount.differentCurrTransVal3, code: 3 },
    ];
  },
  getOvertakingActions() {
    return [
      { name: $.strings.chartOfAccount.empty, code: 0, name_lang2: $.strings.chartOfAccount.empty },
      { name: $.strings.chartOfAccount.allowWithAlert, code: 1, name_lang2: $.strings.chartOfAccount.allowWithAlert },
      { name: $.strings.chartOfAccount.disallowTransaction, code: 2, name_lang2: $.strings.chartOfAccount.disallowTransaction },
    ];
  },
  getOvertakingActionName(actionid) {
    switch (actionid) {
      case 0: {
        return $.strings.chartOfAccount.empty;
      }
      case 1: {
        return $.strings.chartOfAccount.disallowTransaction;
      }
      case 2: {
        return $.strings.chartOfAccount.allowWithAlert;
      }
      default: {
        return '';
      }
    }
  },
  getAccountTransTypes() {
    return [
      { name: $.strings.chartOfAccount.noTransType, code: 0 },
      { name: $.strings.chartOfAccount.debitOnly, code: 1 },
      { name: $.strings.chartOfAccount.creditOnly, code: 2 },
    ];
  },
  getTransTypes() {
    return [
      { name: $.strings.chartOfAccount.debitTrans, code: 1 },
      { name: $.strings.chartOfAccount.creditTrans, code: 2 },
    ];
  },
  getFilterModeId(filterMode) {
    switch (filterMode) {
      case $.strings.customers.contains: {
        return '1';
      }
      case $.strings.customers.startsWith: {
        return '2';
      }
      case $.strings.customers.endsWith: {
        return '3';
      }
      default: {
        return '1';
      }
    }
  },
  getFilterCustTypeId(filterCustTypeId) {
    switch (filterCustTypeId) {
      case $.strings.customers.typeIsCustomers: {
        return '1';
      }
      case $.strings.customers.typeIsEmployees: {
        return '2';
      }
      case $.strings.customers.typeIsSalesMan: {
        return '3';
      }
      default: {
        return '1';
      }
    }
  },
  getDefaultDate() {
    return new Date(1900, 1, 2);
  },
  getCheckStatusName(checkStatusId) {
    switch (checkStatusId) {
      case 1: {
        return $.strings.checks.checkStatus1;
      }
      case 2: {
        return $.strings.checks.checkStatus2;
      }
      case 3: {
        return $.strings.checks.checkStatus3;
      }
      case 4: {
        return $.strings.checks.checkStatus4;
      }
      default: {
        return '';
      }
    }
  },
  getInactiveStatusColor() {
    return 'crimson';
  },
  getWeekDaysList() {
    return [
      { id: 1, name: $.strings.weekDays.saturday },
      { id: 2, name: $.strings.weekDays.sunday },
      { id: 3, name: $.strings.weekDays.monday },
      { id: 4, name: $.strings.weekDays.tuesday },
      { id: 5, name: $.strings.weekDays.wednesday },
      { id: 6, name: $.strings.weekDays.thursday },
      { id: 7, name: $.strings.weekDays.friday },
    ];
  },
  getWeekDayName(dayNo) {
    switch (dayNo) {
      case 1: {
        return $.strings.weekDays.saturday;
      }
      case 2: {
        return $.strings.weekDays.sunday;
      }
      case 3: {
        return $.strings.weekDays.monday;
      }
      case 4: {
        return $.strings.weekDays.tuesday;
      }
      case 5: {
        return $.strings.weekDays.wednesday;
      }
      case 6: {
        return $.strings.weekDays.thursday;
      }
      case 7: {
        return $.strings.weekDays.friday;
      }
      default: {
        return '';
      }
    }
  },
  getMonthsList(addMoreThanMonth, firstItemCaption) {
    if (addMoreThanMonth) {
      return [
        { id: 0, name: firstItemCaption ? firstItemCaption : $.strings.months.addMoreThanOneMonth },
        { id: 1, name: $.strings.months.jan },
        { id: 2, name: $.strings.months.feb },
        { id: 3, name: $.strings.months.march },
        { id: 4, name: $.strings.months.april },
        { id: 5, name: $.strings.months.may },
        { id: 6, name: $.strings.months.june },
        { id: 7, name: $.strings.months.july },
        { id: 8, name: $.strings.months.august },
        { id: 9, name: $.strings.months.september },
        { id: 10, name: $.strings.months.october },
        { id: 11, name: $.strings.months.november },
        { id: 12, name: $.strings.months.decemper },
      ];
    } else {
      return [
        { id: 1, name: $.strings.months.jan },
        { id: 2, name: $.strings.months.feb },
        { id: 3, name: $.strings.months.march },
        { id: 4, name: $.strings.months.april },
        { id: 5, name: $.strings.months.may },
        { id: 6, name: $.strings.months.june },
        { id: 7, name: $.strings.months.july },
        { id: 8, name: $.strings.months.august },
        { id: 9, name: $.strings.months.september },
        { id: 10, name: $.strings.months.october },
        { id: 11, name: $.strings.months.november },
        { id: 12, name: $.strings.months.decemper },
      ];
    }
  },
  getCountingUnit() {
    return [
      { id: 1, name: $.strings.items.decimal },
      { id: 2, name: $.strings.items.integer },
    ];
  },
  checkRights: (rightID) => {
    /*let rights = JSON.parse(localStorage.getItem("rightsERP"));
        if (!rights)
            return false;
        let hasRights = rights.filter(e => e.AccessID === rightID);
        return hasRights && hasRights.length > 0;*/
    return true;
  },
  getSettings(settingsID) {
    let shamelSettings = JSON.parse(localStorage.getItem('shamelSettings'));
    if (shamelSettings) {
      let settings = shamelSettings.filter((e) => e.id === settingsID);
      if (settings && settings.length > 0) {
        return settings[0].value;
      }
    }
    return undefined;
  },
  onCodeLeave(code, codeLen) {
    if (code && code.length > 0) {
      if (code.length < codeLen) {
        code = this.adjustCode(code, codeLen);
        return code;
      }
    }
    return code;
  },
  getNameByUserLanguage(name, nameLang2) {
    return name;

  },
  hideNameByUserLanguage() {
    if (this.getSystemSetting(196) + '' === localStorage.getItem('lang_id') + '') return false;
    else return true;
  },
  hideNameLang2ByUserLanguage() {
    //if (this.getSystemSetting(196) + '' === this.getSystemSetting(197) + '') return true;
    if (this.getSystemSetting(197) + '' === localStorage.getItem('lang_id') + '') return false;
    else return true;
  },
  getMainLanguagePrefix() {
    let prefix = $.settings.Common.mainLanguage ? ' (' + $.settings.Common.langPrefix + ')' : '';
    return prefix;
  },
  getSubLanguagePrefix() {
    let prefix = $.settings.Common.subLanguage ? ' (' + $.settings.Common.subLangPrefix + ')' : '';
    return prefix;
  },
  checkIsSuperAdmin() {
    //return false;
    return localStorage.getItem('user_type') && localStorage.getItem('user_type') === '2' ? true : false;
  },
  checkIsAdmin() {
    return localStorage.getItem('user_type') && localStorage.getItem('user_type') === '3' ? true : false;
  },
  getUserTypesList() {
    return [
      { id: 1, name: $.strings.users.normalUser },
      { id: 2, name: $.strings.users.superAdminUser },
      { id: 3, name: $.strings.users.adminUser },
    ];
  },
  encryptStringToHexa(txt) {
    txt = txt + '';
    const m = txt.length % 16;
    const rest = 16 - m;

    if (m + 1 == 16) {
      txt += '|';
    }
    for (let y = m + 1; y < 16; y++) {
      if (y === m + 1) txt += '|';
      txt += ';';
    }
    // An example 128-bit key
    var key = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

    // The initialization vector (must be 16 bytes)
    var iv = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36];

    // Convert text to bytes (text must be a multiple of 16 bytes)
    var text = txt;
    var textBytes = aesjs.utils.utf8.toBytes(text);

    var aesCbc = new aesjs.ModeOfOperation.cbc(key, iv);

    var encryptedBytes = aesCbc.encrypt(textBytes);

    // To print or store the binary data, you may convert it to hex
    var encryptedHex = aesjs.utils.hex.fromBytes(encryptedBytes);
    // "104fb073f9a131f2cab49184bb864ca2"

    // When ready to decrypt the hex string, convert it back to bytes
    encryptedBytes = aesjs.utils.hex.toBytes(encryptedHex);
    return encryptedHex;
  },
  checkComplexPassword(password) {
    let expression = '(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9])(?=.{6,})';
    let _regExp = new RegExp(expression);
    if (_regExp.test(password)) {
      return true;
    }
    return false;
  },
  checkEmailFormat(email) {
    let expression =
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    let _regExp = new RegExp(expression);
    if (_regExp.test(email)) {
      return true;
    }
    return false;
  },
  getSystemOptions() {
    let values = [
      { id: -1, name: $.strings.all, name_lang2: $.strings.all },
      { id: 1, name: $.strings.PermissionsListGroups.systemOption1, name_lang2: $.strings.PermissionsListGroups.systemOption1 },
      { id: 2, name: $.strings.PermissionsListGroups.systemOption2, name_lang2: $.strings.PermissionsListGroups.systemOption2 },
      { id: 3, name: $.strings.PermissionsListGroups.systemOption3, name_lang2: $.strings.PermissionsListGroups.systemOption3 },
    ];
    return values;
  },
  getSystemOptionsWithOutAll() {
    let values = [
      // { id: -1, name: $.strings.all, name_lang2: $.strings.all },
      { id: 1, name: $.strings.PermissionsListGroups.systemOption1, name_lang2: $.strings.PermissionsListGroups.systemOption1 },
      { id: 2, name: $.strings.PermissionsListGroups.systemOption2, name_lang2: $.strings.PermissionsListGroups.systemOption2 },
      { id: 3, name: $.strings.PermissionsListGroups.systemOption3, name_lang2: $.strings.PermissionsListGroups.systemOption3 },
    ];
    return values;
  },
  checkUserAccess(accessId) {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      const accessListRaw = localStorage.getItem('user_Access_List');
      const userAccessList = accessListRaw ? JSON.parse(accessListRaw) : null;
      const savedUser = localStorage.getItem("erp_user") || sessionStorage.getItem("erp_user")

      if (userAccessList) {
        const userAccess = userAccessList.find((e) => e.access_id + '' === accessId + '' && e.is_granted === true);
        return userAccess ? true : false;
      }
    } catch (error) {
      console.warn("[Util] Failed to resolve user access", error);
    }

    return false;
  },
  getUserSetting(settingId) {
    let userSettingsList = JSON.parse(localStorage.getItem('userSettingsList'));

    if (userSettingsList) {
      let userSetting = userSettingsList.find((e) => e.setting_id + '' === settingId + '');
      if (userSetting) {
        if (userSetting.control_type === 2) return userSetting.value_order_no ? userSetting.value_order_no : userSetting.default_value;
        else return userSetting.value ? userSetting.value : userSetting.default_value;
      }
    }
    return undefined;
  },
  getUserType() {
    let userType = JSON.parse(localStorage.getItem('user_type'));
    if (userType) {
      switch (userType) {
        case 1: {
          return this.userTypeEnum.user;
        }
        case 2: {
          return this.userTypeEnum.superAdmin;
        }
        case 3: {
          return this.userTypeEnum.admin;
        }
        default: {
          return this.userTypeEnum.user;
        }
      }
    }
  },
  getReportPrintSetting(settingId) {
    let reportPrintSettingsList = JSON.parse(localStorage.getItem('reportPrintSettingsList'));
    if (reportPrintSettingsList) {
      let printReportSetting = reportPrintSettingsList.find((e) => e.id + '' === settingId + '');
      if (printReportSetting) {
        if (printReportSetting.control_type === 2) {
          // combobox
          return printReportSetting.value_order_no ? printReportSetting.value_order_no : printReportSetting.default_value;
        } else {
          return printReportSetting.value ? printReportSetting.value : printReportSetting.default_value;
        }
      }
    }
    return undefined;
  },
  getReportPrintSettingsFontValue(settingId) {
    let reportPrintSettingsList = JSON.parse(localStorage.getItem('reportPrintSettingsList'));
    if (reportPrintSettingsList) {
      let printReportSetting = reportPrintSettingsList.find((e) => e.id + '' === settingId + '');
      if (printReportSetting) {
        return printReportSetting.fonts_value ? printReportSetting.fonts_value : printReportSetting.default_value;
      }
    }
    return undefined;
  },
  getSystemSetting(settingId) {
    if (settingId === 73) return 'true';//تفعيل تواريخ الصلاحية
    let systemSettingsList = JSON.parse(localStorage.getItem('systemSettingsList'));
    if (systemSettingsList) {
      let systemSetting = systemSettingsList.find((e) => e.id + '' === settingId + '');
      if (systemSetting) {
        if (systemSetting.control_type === 2 && settingId !== 299) {
          // combobox
          return systemSetting.value_order_no ? systemSetting.value_order_no : systemSetting.default_value;
        } else {
          return systemSetting.value ? systemSetting.value : systemSetting.default_value;
        }
      }
    }
    return undefined;
  },


  getSystemSettingById(settingId, systemSettingsList) {
    if (!systemSettingsList) systemSettingsList = JSON.parse(localStorage.getItem('systemSettingsList'));
    if (systemSettingsList) {
      let systemSetting = systemSettingsList.find((e) => e.id + '' === settingId + '');
      if (systemSetting) {
        if (systemSetting.control_type === 2) {
          // combobox
          return systemSetting.value_order_no ? systemSetting.value_order_no : systemSetting.default_value;
        } else {
          return systemSetting.value ? systemSetting.value : systemSetting.default_value;
        }
      }
    }
    return undefined;
  },

  getLangPrefix(langId) {
    let langPrefixList = JSON.parse(localStorage.getItem('langPrefixList'));
    if (langPrefixList) {
      let langPrefix = langPrefixList.find((e) => e.id + '' === langId + '');
      if (langPrefix) {
        return langPrefix.prefix;
      } else {
        return '';
      }
    }
    return undefined;
  },
  getVoucherSettingScreenData(voucher_id, columnId) {
    const voucherSettings = JSON.parse(localStorage.getItem('screenData') || '{}');
    const voucherKey = voucher_id.toString();

    const columnsForVoucher = voucherSettings.columns?.[voucherKey];
    if (!columnsForVoucher) return true;
    return columnsForVoucher?.[columnId] ?? false;
  },

  checkHasp(haspToCheckArr) {
    let activeHaspList = JSON.parse(localStorage.getItem('haspsList'));
    if (activeHaspList && haspToCheckArr) {
      for (let y = 0; y < haspToCheckArr.length; y++) {
        let activeHasp = activeHaspList.find((e) => e + '' === haspToCheckArr[y] + '');
        return activeHasp ? true : false;
      }
    }
    return false;
  },
  confirmDialog: (message, icon, onAccept, onReject, acceptClassName = 'p-button-success', rejectClassName = 'p-button-danger') => {
    confirmDialog({
      message: message,
      header: $.strings.appName,
      icon: icon,
      acceptClassName: acceptClassName,
      rejectClassName: rejectClassName,
      acceptLabel: $.strings.yes,
      rejectLabel: $.strings.no,
      accept: () => onAccept(),
      reject: () => onReject(),
    });
  },
  alertDialog: (message) => {
    //AlertBox.show(message);
  },
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  haspModuleEnum: {
    accounting: 1,
    costCenter: 2,
    delegates: 3,
    itemsAndStores: 4,
    invoice: 5,
    banksAndChecks: 6,
    orders: 7,
    asetsMangment: 8,
    productions: 9,
    advanceProductions: 10,
    financialReports: 11,
    budgets: 12,
    serialNumbers: 13,
    billsOfExchange: 14,
    employeesAndHR: 15,
    POS: 16,
    migration: 17
  },
  voucherTypeEnum: {
    salesInvoice: 1,
    deliverySell: 2,
    deliveryConsignmentSale: 3, // ارسالية برسم البيع
    returnDeliveryConsignmentSale: 4,
    returnSell: 5,
    purchaseInvoice: 6,
    deliveryPay: 7,
    returnPurchase: 8,
    stockIn: 9,
    stockOut: 10,
    useVoucher: 11,
    internalDelivery: 12,
    credit: 14,
    debit: 15,
    sarf: 16,
    qabd: 17,
    journal: 18,
    offerPrice: 19,
    sellOrder: 20,
    purchaseOrder: 21,
  },
  attachmentTypeEnum: {
    asset: 1,
    voucher: 2,
    assetTrans: 3,
  },
  notesTypeEnum: {
    voucher: 1,
  },
  lookupAccessTypeEnum: {
    insert: 1,
    edit: 2,
    refresh: 3,
    print: 4,
    excel: 5,
    loginToPage: 6,
    checkHasp: 7,
    delete: 8,
    disable: 9,
    log: 10,
    balance: 11,
    lastTrans: 12,
    addPrefix: 13,
    nextPrev: 14,
    postVocuher: 15,
    checkUserByMode: 16,
    search: 17,
  },
  userRecordEnum: {
    account: 1,
    region: 2,
    costCenter: 3,
    store: 4,
    mainStock: 5,
    customers: 6,
    priceClass: 7,
  },
  keyboardKeys: {
    Enter: 13,
    Esc: 27,
    F2: 113,
    F3: 114,
    F4: 115,
    F5: 116,
    F6: 117,
    F7: 118,
    F8: 119,
    F9: 120,
    F10: 121,
    Equal: 187,
    Tab: 9,
    MinusRight: 109,
    MinusLeft: 189,
    PlusRight: 107,
    PlusLeft: 187,
    deleteChar: 8,
    delete: 46,
    Space: 32,
    BackSpace: 8,
    DownArrow: 40,
    UpArrow: 38,
    One: 49,
    Two: 50,
    Three: 51,
    Four: 52,
    Five: 53,
    OneNum: 97,
    TwoNum: 98,
    ThreeNum: 99,
    FourNum: 100,
    FiveNum: 101,
    LeftArrow: 37,
    RightArrow: 39,
    Ctrl: 17,
    Insert: 45,
    A: 65,
    B: 66,
    C: 67,
    D: 68,
    E: 69,
    F: 70,
    G: 71,
    H: 72,
    I: 73,
    J: 74,
    K: 75,
    L: 76,
    M: 77,
    N: 78,
    O: 79,
    P: 80,
    Q: 81,
    R: 82,
    S: 83,
    T: 84,
    U: 85,
    V: 86,
    W: 87,
    X: 88,
    Y: 89,
    Z: 90,
  },
  navigationEnum: {
    PREVIOUS: 1,
    NEXT: 2,
    FIRST: 3,
    LAST: 4,
    GETIT: 5,
  },
  defaultButton: {
    Yes: 1,
    No: 2,
    Cancel: 3,
  },
  cheqStatus: {
    returned: 5,
    returnedToSource: 6,
    cancel: 9,
  },
  orderCustomerScreenTypeEnum: {
    byOrderDetails: 1,
    byOrderQntyDetails: 2,
    byOrderDate: 3,
  },
  orderReadyStatusEnum:
  {
    not_done: 1,
    done: 2,
    closed: 3
  },
  getNodeSelectedFromContexMenuViewById(root, id) {
    for (let i = 0; root && i < root.length; i++) {
      if (root[i].id + '' === id + '' && (root[i].isBank === undefined || (root[i].isBank !== undefined && root[i].isBank + '' === '0'))) {
        return root[i].key;
      }
      if (root[i].children && root[i].children.length > 0) {
        let res = this.getNodeSelectedFromContexMenuViewById(root[i].children, id);
        if (res) {
          return res;
        }
      }
    }
  },
  getNodeSelectedFromContexMenuView(root, key) {
    for (let i = 0; i < root.length; i++) {
      if (root[i].key === key) {
        return root[i];
      }
      if (root[i].children && root[i].children.length > 0) {
        let res = this.getNodeSelectedFromContexMenuView(root[i].children, key);

        if (res) return res;
      }
    }
  },
  callCommonMethods(parent) {
    document.addEventListener('keydown', parent.onPageKeyDown);
  },
  callCommonMethodsUnamount(parent) {
    document.removeEventListener('keydown', parent.onPageKeyDown);
  },

  base64toBlob(base64Data, contentType) {
    contentType = contentType || '';
    var sliceSize = 1024;
    var byteCharacters = atob(base64Data);
    var bytesLength = byteCharacters.length;
    var slicesCount = Math.ceil(bytesLength / sliceSize);
    var byteArrays = new Array(slicesCount);

    for (var sliceIndex = 0; sliceIndex < slicesCount; ++sliceIndex) {
      var begin = sliceIndex * sliceSize;
      var end = Math.min(begin + sliceSize, bytesLength);

      var bytes = new Array(end - begin);
      for (var offset = begin, i = 0; offset < end; ++i, ++offset) {
        bytes[i] = byteCharacters[offset].charCodeAt(0);
      }
      byteArrays[sliceIndex] = new Uint8Array(bytes);
    }
    return new Blob(byteArrays, { type: contentType });
  },
  initializedGrid(flexgrid, rowsHeight) {
    this.flex = flexgrid;
    this.flex.rows.defaultSize = rowsHeight;
  },
  gridColumnStartEditing(grid, rowIndex, colIndex, startEdit) {
    try {
      if (rowIndex === -1) rowIndex = 0;
      grid.focus();
      grid.select(rowIndex, colIndex);
      //grid.scrollIntoView(rowIndex, colIndex);
      if (startEdit) {
        grid.startEditing(true, rowIndex, colIndex, true);
      }
    } catch (e) { }
  },
  showInfoToast(toastObj, msgText, msgTitle) {
    try {
      if (!msgText) msgText = $.strings.operationDone;
      toastObj.show({
        severity: 'info',
        summary: msgTitle ? msgTitle : '',
        detail: msgText,
        life: 3000,
        className: 'erp-toast erp-toast-info',
      });
    } catch (e) { }
  },
  showErrorToast(toastObj, msgText, msgTitle) {
    try {
      if (!msgText) msgText = $.strings.operationFailed;
      toastObj.show({
        severity: 'error',
        summary: msgTitle ? msgTitle : '',
        detail: msgText,
        life: 6000,
        className: 'erp-toast erp-toast-error',
      });
    } catch (e) { }
  },
  showSuccessToast(toastObj, msgText, msgTitle) {
    try {
      if (!msgText) msgText = $.strings.operationDone;
      toastObj.show({
        severity: 'success',
        summary: msgTitle ? msgTitle : '',
        detail: msgText,
        life: 3000,
        className: 'erp-toast erp-toast-success',
      });
    } catch (e) { }
  },
  showWarningToast(toastObj, msgText, msgTitle) {
    try {
      if (!msgText) msgText = $.strings.operationDone;
      toastObj.show({
        severity: 'warn',
        summary: msgTitle ? msgTitle : '',
        detail: msgText,
        life: 3000,
        className: 'erp-toast erp-toast-warning',
      });
    } catch (e) { }
  },
  checkContactsRepeated(data, typeId, value, rowIndex) {
    for (let i = 0; i < data.length; i++) {
      if (data[i].type_id + '' === typeId + '' && data[i].value + '' === value + '' && i !== rowIndex) {
        return false;
      }
    }
    return true;
  },
  checkMainContactsRepeated(data, typeId, value, rowIndex) {
    let isMainCounter = 1;
    let listOfMain = data.filter((e) => e.type_id + '' === typeId + '' && e.is_main);
    if (listOfMain && listOfMain.length > 1) return true;
    else return false;
  },
  validateEmail(email) {
    if (email && email !== 'null' && email.length > 0) {
      let re =
        /^(([^<>()\\[\]\\.,;:\s@"]+(\.[^<>()\\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
      return re.test(email + '');
    }
    return true;
  },
  contactEmailValidator(value) {
    return this.validateEmail(value);
  },
  validatePhone(phone) {
    if (phone && phone !== 'null' && phone.length > 0) {
      var re = /^[\\+]?[(]?[0-9]{1,}[)]?[-\\s\\.]?[0-9]{1,}[-\\s\\.]?[0-9]{6,20}$/im;
      return re.test(phone);
    }
    return true;
  },
  contactMobileEmailValidator(value) {
    if (!this.validatePhone(value)) {
      return false;
    }
    return true;
  },
  contactsValidations(data) {
    let result = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i]['value'] !== null && data[i]['value'] + '' !== '') {
        if (data[i]['type_id'] === 3) {
          // Email
          if (!this.validateEmail(data[i]['value'])) {
            result.push({ type: 'E', message: $.strings.salesMan.emailError });
          }
        } else if (data[i]['type_id'] === 1 || data[i]['type_id'] === 2 || data[i]['type_id'] === 5) {
          // Mobile || Phone || WhatsApp
          if (!this.validatePhone(data[i]['value'])) {
            result.push({
              type: 'E',
              message: $.strings.salesMan.phoneError + ' (' + data[i]['value'] + ')',
            });
          }
        }
        if (!this.checkContactsRepeated(data, data[i]['type_id'], data[i]['value'], i)) {
          result.push({
            type: 'W',
            message: $.strings.salesMan.contactRepeatedError + ' (' + data[i]['value'] + ')',
          });
        }
        if (this.checkMainContactsRepeated(data, data[i]['type_id'], data[i]['value'], i)) {
          result.push({
            type: 'W',
            message: $.strings.salesMan.contactIsMainRepeatedError,
          });
        }
      }
    }
    return result;
  },
  getNodeSelectedFromNavigation(root, key, navigationType, isBranch) {
    if (root.length === 0) return root;
    if (navigationType === this.navigationEnum.LAST) {
      let lastNode = root[root.length - 1];
      if (lastNode.children && lastNode.children.length > 0) {
        let res = this.getNodeSelectedFromNavigation(lastNode.children, key, navigationType);
        if (res) return res;
      } else {
        if (!isBranch) return lastNode;
        else {
          if (lastNode.children === null) {
            for (let y = root.length - 1; y > 0; y--) {
              if (root[y].children && root[y].children.length > 0) {
                return root[y].children[root[y].children.length - 1];
              }
            }
          }
        }
      }
    } else if (navigationType === this.navigationEnum.FIRST) {
      if (isBranch && root[0].children && root[0].children.length > 0) {
        return root[0].children[0];
      } else {
        if (root[0].children !== null) {
          for (let y = 0; y < root.length; y++) {
            if (root[y].children && root[y].children.length > 0) {
              return root[y].children[0];
            }
          }
        }
        return root[0];
      }
    } else if (navigationType === this.navigationEnum.NEXT) {
      let nodeSelected = this.getNodeSelectedFromContexMenuView(root, key);
      let index = nodeSelected.index;
      let finalResult = this.getNodeSelectedFromContexMenuViewByIndex(root, ++index);
      if (!finalResult) return nodeSelected;
      if (isBranch) {
        return this.recurgionToGetFatherCode(finalResult, root, index, true);
      } else return finalResult;
    } else if (navigationType === this.navigationEnum.PREVIOUS) {
      let nodeSelected = this.getNodeSelectedFromContexMenuView(root, key);
      let index = nodeSelected.index;
      let finalResult = this.getNodeSelectedFromContexMenuViewByIndex(root, --index);
      if (!finalResult) return nodeSelected;
      if (isBranch) return this.recurgionToGetFatherCode(finalResult, root, index, false);
      else return finalResult;
    }
  },
  getNodeSelectedFromNavigationStoreLocation(root, key, navigationType) {
    if (root.length === 0) return root;
    if (navigationType === this.navigationEnum.LAST) {
      let x = root.length - 1;
      let lastNode = root[x];
      while (x >= 0) {
        if (lastNode.children && lastNode.children.length > 0) {
          const rslt = this.getNodeSelectedFromNavigationStoreLocation(lastNode.children, key, navigationType);
          if (rslt) return rslt;
        } else {
          if (lastNode && lastNode.fatherPath !== '' && lastNode.status !== '2') return lastNode;
        }
        lastNode = root[--x];
      }
      return null;
    } else if (navigationType === this.navigationEnum.FIRST) {
      let x = 0;
      let firstNode = root[x];
      while (x < root.length) {
        if (firstNode.children && firstNode.children.length > 0) {
          const rslt = this.getNodeSelectedFromNavigationStoreLocation(firstNode.children, key, navigationType);
          if (rslt) return rslt;
        } else {
          if (firstNode && firstNode.fatherPath !== '' && firstNode.status !== '2') return firstNode;
        }
        firstNode = root[--x];
      }
      return null;
    } else if (navigationType === this.navigationEnum.NEXT) {
      let nodeSelected = this.getNodeSelectedFromContexMenuView(root, key);
      let index = nodeSelected.index;
      let finalResult = this.getNodeSelectedFromContexMenuViewByIndex(root, ++index);
      if (!finalResult) return nodeSelected;
      return this.recurgionToGetFatherCode(finalResult, root, index, true);
    } else if (navigationType === this.navigationEnum.PREVIOUS) {
      let nodeSelected = this.getNodeSelectedFromContexMenuView(root, key);
      let index = nodeSelected.index;
      let finalResult = this.getNodeSelectedFromContexMenuViewByIndex(root, --index);
      if (!finalResult) return nodeSelected;
      return this.recurgionToGetFatherCode(finalResult, root, index, false);
    }
  },
  //////////////////////
  recurgionToGetFatherCode(finalResult, root, index, plus) {
    if (finalResult.fatherBank + '' === '0' || finalResult.fatherPath + '' === '') {
      if (plus) ++index;
      else --index;
      finalResult = this.getNodeSelectedFromContexMenuViewByIndex(root, index);
      if (finalResult && (finalResult.fatherBank + '' === '0' || finalResult.fatherPath + '' === '')) {
        finalResult = this.recurgionToGetFatherCode(finalResult, root, index, plus);
      } else return finalResult;
    }
    return finalResult;
  },
  getNodeSelectedFromContexMenuViewByIndex(root, index) {
    for (let i = 0; i < root.length; i++) {
      if (root[i].index + '' === index + '') {
        return root[i];
      }
      if (root[i].children && root[i].children.length > 0) {
        let res = this.getNodeSelectedFromContexMenuViewByIndex(root[i].children, index);
        if (res) return res;
      }
    }
  },
  setColumnWidthForPrint(listOfColumns, colName, colWidth) {
    listOfColumns.forEach((col) => {
      if (col.visible && col.colName === colName) {
        col.columnWidth = colWidth;
      }
    });
    return listOfColumns;
  },
  isCodeFormat(text) {
    return /^[A-Za-z0-9]*$/.test(text);
  },
  isArabic(text) {
    var pattern = /[\u0600-\u06FF\u0750-\u077F]/;
    let result = pattern.test(text);
    return result;
  },
  isNumber(key) {
    return !!{
      0: true,
      1: true,
      2: true,
      3: true,
      4: true,
      5: true,
      6: true,
      7: true,
      8: true,
      9: true,
      '٠': true,
      '١': true,
      '٢': true,
      '٣': true,
      '٤': true,
      '٥': true,
      '٦': true,
      '٧': true,
      '٨': true,
      '٩': true,
    }[key];
  },
  isSpaceOrSymbols(text) {
    const specialChars = /[`!@#$%^&*()_+\-=\\[\]{};':"\\|,.<>\\/?~]/;
    let result = specialChars.test(text);
    if (!result) {
      result = /\s/g.test(text);
    }
    return result;
  },
  getMode(props) {
    if (props && props.match && props.match.params && props.match.params.id) return 'edit';
    else return 'new';
  },
  getVouchersBooksLetters(isFirstVoucherBook) {
    let dataTemp = [];
    if (isFirstVoucherBook) dataTemp.push({ id: '0', name: '0' });
    else dataTemp.push({ id: '---', name: '---' });

    const alpha = Array.from(Array(26)).map((e, i) => i + 65);
    alpha.map((x) => dataTemp.push({ id: String.fromCharCode(x), name: String.fromCharCode(x) }));
    return dataTemp;
  },
  getDateAsShortDate(dt) {
    if (!dt) return null;
    let isDate = dt instanceof Date;
    const formattedDate = !isDate ? dt.toString().split('T')[0] : dt.toLocaleDateString();
    return formattedDate;
  },
  getMultiSelectDropdownFilterString(list, caption, columnCaption = 'name') {
    let result = '';
    if (list && list.length > 0) {
      list.forEach((e) => {
        result += e[columnCaption] + ',';
      });
      //remove last comma
      result = caption + ' : ' + result.substring(0, result.length - 1);
      if (list.length > 3) {
        let s = list.length < 11 ? $.strings.Reports.filterExceedMaxLimitItems : $.strings.Reports.filterExceedMaxLimitItem;
        s = s.replace('....', list.length);
        result = caption + ' : ' + s;
      }
    }
    return result;
  },
  getMultiSelectDropdownFilterStringNew(list, caption, columnCaption = 'name') {
    let result = '';
    let result2 = '';
    let index = 0;
    if (list && list.length > 0) {
      list.forEach((e) => {
        result += e[columnCaption] + ',';
        if (index < 2) result2 += e[columnCaption] + ',';
        index++;
      });
      //remove last comma
      result = caption + ' : ' + result.substring(0, result.length - 1);
      result2 = caption + ' : ' + result2.substring(0, result2.length - 1);
      if (list.length > 2) {
        result = result2 + '...';
      }
    }
    return result;
  },
  getDateFormat(date) {
    if (date instanceof Date);
    else {
      date = new Date(date);
    }
    let day = date.getDate();
    let month = date.getMonth() + 1;
    let year = date.getFullYear();

    let d = new Date(year, month - 1, day, 0, 0, 0, 0);
    return d.toLocaleDateString('en-Us');
  },
  getDateFormatAsDate(date) {
    if (date instanceof Date);
    else {
      date = new Date(date);
    }
    let day = date.getDate();
    let month = date.getMonth() + 1;
    let year = date.getFullYear();

    let d = new Date(year, month - 1, day, 0, 0, 0, 0);
    return d;
  },
  getDateFormatWithTime(date) {
    if (date instanceof Date);
    else {
      date = new Date(date);
    }
    let hours = date.getHours();
    let minutes = date.getMinutes();
    let seconds = date.getSeconds();

    let d = date; //new Date(year, month - 1, day, hours, minutes, seconds, miliseconds);

    hours = String(hours).padStart(2, '0');
    minutes = String(minutes).padStart(2, '0');
    seconds = String(seconds).padStart(2, '0');

    let result = d.toLocaleDateString('en-Us') + ' ' + hours + ':' + minutes + ':' + seconds;

    return result;
  },
  getDateFormatWithTimeNewFormate(date) {
    if (date instanceof Date);
    else {
      date = new Date(date);
    }
    let hours = date.getHours();
    let minutes = date.getMinutes();
    let seconds = date.getSeconds();

    let d = date; //new Date(year, month - 1, day, hours, minutes, seconds, miliseconds);

    hours = String(hours).padStart(2, '0');
    minutes = String(minutes).padStart(2, '0');
    seconds = String(seconds).padStart(2, '0');

    // let result = d.toLocaleDateString('en-Us') + ' ' + hours + ':' + minutes + ':' + seconds;

    let day = date.getDate().toString().padStart(2, '0');
    let month = (date.getMonth() + 1).toString().padStart(2, '0');
    let year = date.getFullYear();
    let separator = '/';
    return hours + ':' + minutes + ':' + seconds + ' ' + `${day}${separator}${month}${separator}${year}`;
  },
  getNumberColumnFormat(systemSetting17, systemSetting18) {
    if (!systemSetting17) systemSetting17 = this.getSystemSetting(17);
    if (!systemSetting18) systemSetting18 = this.getSystemSetting(18);
    let format = 'g';
    if (systemSetting18)
      // Check thousands separator
      format = 'G';
    return (format += systemSetting17); // Check decimal digits count
  },
  getNumberColumnFormatLengthWidth(systemSetting17, systemSetting18) {
    if (!systemSetting17) systemSetting17 = this.getSystemSetting(17);
    if (!systemSetting18) systemSetting18 = this.getSystemSetting(18);
    let format = 'g';
    if (systemSetting18)
      // Check thousands separator
      format = 'F';
    return (format += systemSetting17); // Check decimal digits count
  },
  getBarcodeColumnList() {
    return [
      { id: 2625, name: $.strings.items.barcode, name_lang2: $.strings.items.barcode, value_order_no: '1' },
      { id: 2626, name: $.strings.items.originalCode, name_lang2: $.strings.items.originalCode, value_order_no: '2' },
      { id: 2627, name: $.strings.items.oem, name_lang2: $.strings.items.oem, value_order_no: '3' },
    ];
  },
  getTime(date) {
    if (date instanceof Date);
    else {
      return date;
    }

    let hours = date.getHours();
    let minutes = date.getMinutes();

    let d = date; //new Date(year, month - 1, day, hours, minutes, seconds, miliseconds);

    hours = String(hours).padStart(2, '0');
    minutes = String(minutes).padStart(2, '0');

    const result = hours + ':' + minutes;
    return result;
  },
  getTimeHHMM(dt) {
    if (!dt) return "";

    const h = dt.getHours().toString().padStart(2, "0");
    const m = dt.getMinutes().toString().padStart(2, "0");

    return `${h}:${m}`;
  },
  validateExtraFields(extraFieldsList, formErrors) {
    let success = true;
    if (extraFieldsList) {
      extraFieldsList.forEach((element) => {
        let name = this.getNameByUserLanguage(element.label, element.label_lang2);
        formErrors[element.id.toString()] = '';
        if (
          element.reg_expression &&
          element.reg_expression.toString().trim() !== '' &&
          element.value &&
          element.value.toString().trim().length > 0
        ) {
          const _regExp = new RegExp(element.reg_expression + '');
          if (!_regExp.test(element.value + '')) {
            formErrors[element.id.toString()] = $.strings.extraFields.fieldValue + " '" + name + "' " + $.strings.extraFields.notMatchRegExpression;
            success = false;
          }
        }
        switch (element.control_type_id) {
          case 1: {
            // Text
            if (element.value && element.value.toString().trim().length > element.length) {
              success = false;
              formErrors[element.id.toString()] =
                $.strings.extraFields.length + " '" + name + "' " + $.strings.extraFields.lessOrEqual + ' (' + element.length + ')';
            }
            break;
          }
          case 2: {
            // Integer
            // check max
            if (element.value && element.max) {
              let max = parseInt(element.max);
              let val = parseInt(element.value);
              if (val > max) {
                success = false;
                formErrors[element.id.toString()] =
                  $.strings.extraFields.fieldValue + " '" + name + "' " + $.strings.extraFields.lessOrEqual + ' (' + max + ')';
              }
            }
            // check min
            if (element.value && element.min) {
              let min = parseInt(element.min);
              let val = parseInt(element.value);
              if (val < min) {
                success = false;
                formErrors[element.id.toString()] =
                  $.strings.extraFields.fieldValue + " '" + name + "' " + $.strings.extraFields.greaterOrEqual + ' (' + min + ')';
              }
            }
            break;
          }
          case 3: {
            // Decimals
            // check max
            if (element.value && element.max) {
              let max = parseFloat(element.max);
              let val = parseFloat(element.value);
              if (val > max) {
                success = false;
                formErrors[element.id.toString()] =
                  $.strings.extraFields.fieldValue + " '" + name + "' " + $.strings.extraFields.lessOrEqual + ' (' + max + ')';
              }
            }
            // check min
            if (element.value && element.min) {
              let min = parseFloat(element.min);
              let val = parseFloat(element.value);
              if (val < min) {
                success = false;
                formErrors[element.id.toString()] =
                  $.strings.extraFields.fieldValue + " '" + name + "' " + $.strings.extraFields.greaterOrEqual + ' (' + min + ')';
              }
            }
            break;
          }
          case 4: {
            // date
            // check max
            if (element.value && element.max) {
              let toDate = new Date(element.max);
              if (toDate.getFullYear() === 2000 && toDate.getMonth() === 0 && toDate.getDate() === 1) {
                toDate = new Date();
              }
              let date = new Date(element.value);
              if (date > toDate) {
                success = false;
                formErrors[element.id.toString()] =
                  $.strings.extraFields.fieldValue + " '" + name + "' " + $.strings.extraFields.lessOrEqual + ' (' + this.getDateFormat(toDate) + ')';
              }
            }
            // check min
            if (element.value && element.min) {
              let fromDate = new Date(element.min);
              if (fromDate.getFullYear() === 2000 && fromDate.getMonth() === 0 && fromDate.getDate() === 1) {
                // fromDate = new Date();
              }
              let date = new Date(element.value);
              if (date < fromDate) {
                success = false;
                formErrors[element.id.toString()] =
                  $.strings.extraFields.fieldValue +
                  " '" +
                  name +
                  "' " +
                  $.strings.extraFields.greaterOrEqual +
                  ' (' +
                  this.getDateFormat(fromDate) +
                  ')';
              }
            }

            element.default_value = this.getDateFormat(element.default_value);
            element.min = this.getDateFormat(element.min);
            element.max = this.getDateFormat(element.max);
            element.value = this.getDateFormat(element.value);
            break;
          }
          case 5: {
            // Time
            let nowDate = new Date();
            nowDate = this.getDateFormat(nowDate);
            // check max
            if (element.value && element.max) {
              let toTime = new Date(nowDate + ' ' + element.max);
              if (toTime.getHours() === 0 && toTime.getMinutes() === 0) {
                toTime = new Date();
              }
              let time = new Date(element.value);
              if (time > toTime) {
                success = false;
                formErrors[element.id.toString()] =
                  $.strings.extraFields.fieldValue + " '" + name + "' " + $.strings.extraFields.lessOrEqual + ' (' + this.getTime(toTime) + ')';
              }
            }
            // check min
            if (element.value && element.min) {
              let fromTime = new Date(nowDate + ' ' + element.min);
              if (fromTime.getHours() === 0 && fromTime.getMinutes() === 0) {
                fromTime = new Date();
              }
              let time = new Date(element.value);
              if (time < fromTime) {
                success = false;
                formErrors[element.id.toString()] =
                  $.strings.extraFields.fieldValue + " '" + name + "' " + $.strings.extraFields.greaterOrEqual + ' (' + this.getTime(fromTime) + ')';
              }
            }

            if (element.value && (element.value < element.min || element.value > element.max)) {
              success = false;
              formErrors[element.id.toString()] =
                $.strings.extraFields.fieldValue +
                " '" +
                name +
                "' " +
                $.strings.extraFields.mustBetween +
                ' (' +
                element.min +
                ', ' +
                element.max +
                ')';
            }
            element.value = this.getTime(element.value);
            break;
          }
          case 6: {
            // Date Time
            // check max
            if (element.value && element.max) {
              let toDate = new Date(element.max);
              if (
                toDate.getFullYear() === 2000 &&
                toDate.getMonth() === 0 &&
                toDate.getDate() === 1 &&
                toDate.getHours() === 0 &&
                toDate.getMinutes() === 0
              ) {
                toDate = new Date();
              }
              let date = new Date(element.value);
              if (date > toDate) {
                success = false;
                formErrors[element.id.toString()] =
                  $.strings.extraFields.fieldValue +
                  " '" +
                  name +
                  "' " +
                  $.strings.extraFields.lessOrEqual +
                  ' (' +
                  this.getDateFormatWithTime(toDate) +
                  ')';
              }
            }
            // check min
            if (element.value && element.min) {
              let fromDate = new Date(element.min);
              if (
                fromDate.getFullYear() === 2000 &&
                fromDate.getMonth() === 0 &&
                fromDate.getDate() === 1 &&
                fromDate.getHours() === 0 &&
                fromDate.getMinutes() === 0
              ) {
                fromDate = new Date();
              }
              let date = new Date(element.value);
              if (date < fromDate) {
                success = false;
                formErrors[element.id.toString()] =
                  $.strings.extraFields.fieldValue +
                  " '" +
                  name +
                  "' " +
                  $.strings.extraFields.greaterOrEqual +
                  ' (' +
                  this.getDateFormatWithTime(fromDate) +
                  ')';
              }
            }
            element.default_value = this.getDateFormatWithTime(element.default_value);
            element.min = this.getDateFormatWithTime(element.min);
            element.max = this.getDateFormatWithTime(element.max);
            element.value = this.getDateFormatWithTime(element.value);
            break;
          }
          case 7: {
            // ComboBox
            break;
          }
          case 8: {
            // Checkbox
            break;
          }
          case 9: {
            // Multi Line Text
            if (element.value && element.value.toString().trim().length > element.length) {
              success = false;
              formErrors[element.id.toString()] =
                $.strings.extraFields.length + " '" + name + "' " + $.strings.extraFields.lessOrEqual + ' (' + element.length + ')';
            }
            break;
          }
          default: {
            break;
          }
        }
      });
    }
    return success;
  },
  getExtraFieldsForSave(extraFieldsList) {
    if (extraFieldsList) {
      extraFieldsList.forEach((element) => {
        switch (element.control_type_id) {
          case 4: {
            // date
            element.default_value = this.getDateFormat(element.default_value);
            element.min = this.getDateFormat(element.min);
            element.max = this.getDateFormat(element.max);
            element.value = this.getDateFormat(element.value);
            break;
          }
          case 5: {
            element.value = this.getTime(element.value);
            break;
          }
          case 6: {
            element.default_value = this.getDateFormatWithTime(element.default_value);
            element.min = this.getDateFormatWithTime(element.min);
            element.max = this.getDateFormatWithTime(element.max);
            element.value = this.getDateFormatWithTime(element.value);
            break;
          }
          default: {
            break;
          }
        }
      });
    }
    return extraFieldsList;
  },
  visibleExtraFieldColumn(data, columnName) {
    let result = data.filter((e) => e[columnName] && e[columnName].length > 0).length > 0;
    return result;
  },
  getChequesStatusList() {
    return [
      { id: 0, name: $.strings.cheques.all, name_lang2: $.strings.cheques.all }, // كل الشيكات
      { id: 1, name: $.strings.cheques.notDrawn, name_lang2: $.strings.cheques.notDrawn }, // ليست بالحساب
      { id: 2, name: $.strings.cheques.postpond, name_lang2: $.strings.cheques.postpond }, // مؤجل
      { id: 3, name: $.strings.cheques.inBank, name_lang2: $.strings.cheques.inBank }, // برسم التحصيل
      { id: 4, name: $.strings.cheques.drawn, name_lang2: $.strings.cheques.drawn }, // تم ايداعه
      { id: 5, name: $.strings.cheques.returned, name_lang2: $.strings.cheques.returned }, // راجع
      { id: 6, name: $.strings.cheques.returnedToSource, name_lang2: $.strings.cheques.returnedToSource }, // اعيد للمصدر
      { id: 7, name: $.strings.cheques.endorsed, name_lang2: $.strings.cheques.endorsed }, // محول مجير
    ];
  },
  gridDateFormat() {
    return 'dd/MM/yyyy';
  },
  parseAsString(value) {
    if (value === null || value === undefined) {
      return value;
    }
    return value + '';
  },
  jsonReviver(key, value) {
    const _rxDate = /^\d{4}\-\d{2}\-\d{2}T\d{2}\:\d{2}\:\d{2}|\/Date\([\d\-]*?\)/;
    if (typeof value === 'string' && _rxDate.test(value)) {
      value =
        value.indexOf('/Date(') === 0 // verbosejson
          ? new Date(parseInt(value.substr(6)))
          : new Date(value);
    }
    return value;
  },
  checkUserAccessByVoucherType(voucherTypeEnum, accessType, approved, dataObject) {
    switch (voucherTypeEnum) {
      case 1: {
        //   فاتورة مبيعات
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(683)) {
              this.goTo('/Access/683');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(684); //636
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(685); //
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(689);
          }
          case this.lookupAccessTypeEnum.delete: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(686);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.search:
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(689);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            }
            if (!this.checkUserAccess(684) && dataObject && dataObject.id > 0) {
              return this.checkUserAccess(685) && this.checkUserAccess(687);
            } else if (!this.checkUserAccess(684) && dataObject && dataObject.id === 0) {
              return false;
            }
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              return this.checkUserAccess(685) && this.checkUserAccess(687);
            } else return this.checkUserAccess(687);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(688);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return this.checkUserAccess(685);
              } else {
                return this.checkUserAccess(684);
              }
            } else {
              if (dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if ((dataObject && dataObject.vch_status === 2) || dataObject.status === 3) return false;
                return this.checkUserAccess(685);
              } // insert
              else {
                return this.checkUserAccess(684);
              }
            }
          }
        }
        break;
      }
      case 2: {
        //  ارسالية مبيعات
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(635)) {
              this.goTo('/Access/635');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(636);
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(637);
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(641);
          }
          case this.lookupAccessTypeEnum.delete: {
            // if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
            //   if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            // }
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(638);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.search:
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(641);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            }
            if (!this.checkUserAccess(636) && dataObject && dataObject.id > 0) {
              return this.checkUserAccess(637) && this.checkUserAccess(639);
            } else if (!this.checkUserAccess(636) && dataObject && dataObject.id === 0) {
              return false;
            }
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              return this.checkUserAccess(637) && this.checkUserAccess(639);
            } else return this.checkUserAccess(639);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(640);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return this.checkUserAccess(637);
              } else {
                return this.checkUserAccess(636);
              }
            } else {
              if (dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if ((dataObject && dataObject.vch_status === 2) || dataObject.status === 3) return false;
                return this.checkUserAccess(637);
              } // insert
              else {
                return this.checkUserAccess(636);
              }
            }
          }
        }
        break;
      }
      case 3: {
        //  ارسالية برسم البيع
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(643)) {
              this.goTo('/Access/643');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(644);
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(645);
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(649);
          }
          case this.lookupAccessTypeEnum.delete: {
            // if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
            //   if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            // }
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(646);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.search:
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(649);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            }
            if (!this.checkUserAccess(644) && dataObject && dataObject.id > 0) {
              return this.checkUserAccess(645) && this.checkUserAccess(647);
            } else if (!this.checkUserAccess(644) && dataObject && dataObject.id === 0) {
              return false;
            } else return this.checkUserAccess(647);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(648);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return this.checkUserAccess(645);
              } else {
                return this.checkUserAccess(644);
              }
            } else {
              if (dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if ((dataObject && dataObject.vch_status === 2) || dataObject.status === 3) return false;
                return this.checkUserAccess(645);
              } // insert
              else {
                return this.checkUserAccess(644);
              }
            }
          }
        }
        break;
      }
      case 4: {
        //  مرتجع ارسالية برسم البيع
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(791)) {
              this.goTo('/Access/791');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(792);
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return false;
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(797);
          }
          case this.lookupAccessTypeEnum.delete: {
            // if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
            //   if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            // }
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(794);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.search:
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(797);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            }
            if (!this.checkUserAccess(792) && dataObject && dataObject.id > 0) {
              return false && this.checkUserAccess(795);
            } else if (!this.checkUserAccess(792) && dataObject && dataObject.id === 0) {
              return false;
            }
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              return false && this.checkUserAccess(795);
            } else return this.checkUserAccess(795);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(796);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return false;
              } else {
                return this.checkUserAccess(792);
              }
            } else {
              if (dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if ((dataObject && dataObject.vch_status === 2) || dataObject.status === 3) return false;
                return false;
              } // insert
              else {
                return this.checkUserAccess(792);
              }
            }
          }
        }
        break;
      }
      case 5: {
        //    مردودات مبيعات
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(766)) {
              this.goTo('/Access/766');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(767); //
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(768); //
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(772);
          }
          case this.lookupAccessTypeEnum.delete: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(769);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.search:
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(772);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            }
            if (!this.checkUserAccess(767) && dataObject && dataObject.id > 0) {
              return this.checkUserAccess(768) && this.checkUserAccess(770);
            } else if (!this.checkUserAccess(767) && dataObject && dataObject.id === 0) {
              return false;
            }
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              return this.checkUserAccess(768) && this.checkUserAccess(639);
            } else return this.checkUserAccess(770);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(771);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return this.checkUserAccess(768);
              } else {
                return this.checkUserAccess(767);
              }
            } else {
              if (dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if ((dataObject && dataObject.vch_status === 2) || dataObject.status === 3) return false;
                return this.checkUserAccess(768);
              } // insert
              else {
                return this.checkUserAccess(767);
              }
            }
          }
        }
        break;
      }
      case 6: {
        //   فاتورة مشتريات
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(675)) {
              this.goTo('/Access/675');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(676); //
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(677); //
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(681);
          }
          case this.lookupAccessTypeEnum.delete: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(678);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.search:
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(681);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            }
            if (!this.checkUserAccess(676) && dataObject && dataObject.id > 0) {
              return this.checkUserAccess(677) && this.checkUserAccess(679);
            } else if (!this.checkUserAccess(676) && dataObject && dataObject.id === 0) {
              return false;
            }
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              return this.checkUserAccess(677) && this.checkUserAccess(639);
            } else return this.checkUserAccess(679);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(680);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return this.checkUserAccess(677);
              } else {
                return this.checkUserAccess(676);
              }
            } else {
              if (dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if ((dataObject && dataObject.vch_status === 2) || dataObject.status === 3) return false;
                return this.checkUserAccess(677);
              } // insert
              else {
                return this.checkUserAccess(676);
              }
            }
          }
        }
        break;
      }
      case 7: {
        //  ارسالية مشتريات
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(627)) {
              this.goTo('/Access/627');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(628);
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(629);
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(633);
          }
          case this.lookupAccessTypeEnum.delete: {
            // if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
            //   if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            // }
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(630);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.search:
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(633);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            }
            if (!this.checkUserAccess(628) && dataObject && dataObject.id > 0) {
              return this.checkUserAccess(629) && this.checkUserAccess(631);
            } else if (!this.checkUserAccess(628) && dataObject && dataObject.id === 0) {
              return false;
            } else return this.checkUserAccess(631);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(632);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return this.checkUserAccess(629);
              } else {
                return this.checkUserAccess(628);
              }
            } else {
              if (dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if ((dataObject && dataObject.vch_status === 2) || dataObject.status === 3) return false;
                return this.checkUserAccess(629);
              } // insert
              else {
                return this.checkUserAccess(628);
              }
            }
          }
        }
        break;
      }
      case 8: {
        //    مردودات مشتريات
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(773)) {
              this.goTo('/Access/773');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(774); //
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(775); //
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(779);
          }
          case this.lookupAccessTypeEnum.delete: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(776);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.search:
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(779);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            }
            if (!this.checkUserAccess(774) && dataObject && dataObject.id > 0) {
              return this.checkUserAccess(775) && this.checkUserAccess(777);
            } else if (!this.checkUserAccess(774) && dataObject && dataObject.id === 0) {
              return false;
            }
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              return this.checkUserAccess(775) && this.checkUserAccess(639);
            } else return this.checkUserAccess(777);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(778);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return this.checkUserAccess(775);
              } else {
                return this.checkUserAccess(774);
              }
            } else {
              if (dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if ((dataObject && dataObject.vch_status === 2) || dataObject.status === 3) return false;
                return this.checkUserAccess(775);
              } // insert
              else {
                return this.checkUserAccess(774);
              }
            }
          }
        }
        break;
      }
      case 14: {
        // Credit
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(563)) {
              this.goTo('/Access/563');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.search: {
            return this.checkUserAccess(570);
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(564);
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(565);
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(569);
          }
          case this.lookupAccessTypeEnum.delete: {
            // if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
            //   if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            // }
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(566);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(569);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            }
            if (!this.checkUserAccess(564) && dataObject && dataObject.id > 0) {
              return this.checkUserAccess(565) && this.checkUserAccess(567);
            } else if (!this.checkUserAccess(564) && dataObject && dataObject.id === 0) {
              return false;
            }
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              return this.checkUserAccess(565) && this.checkUserAccess(567);
            } else return this.checkUserAccess(567);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(568);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return this.checkUserAccess(567);
              } else {
                return this.checkUserAccess(564);
              }
            } else {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
                return this.checkUserAccess(565);
              } // insert
              else {
                return this.checkUserAccess(564);
              }
            }
          }
        }
        break;
      }
      case 15: {
        // debit
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(571)) {
              this.goTo('/Access/571');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(572);
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(573);
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(577);
          }
          case this.lookupAccessTypeEnum.delete: {
            // if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
            //   if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            // }
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(574);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.search:
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(577);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            }

            if (!this.checkUserAccess(575) && dataObject && dataObject.id > 0) {
              return this.checkUserAccess(572) && this.checkUserAccess(573);
            } else if (!this.checkUserAccess(575) && dataObject && dataObject.id === 0) {
              return false;
            } else return this.checkUserAccess(572);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(576);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return this.checkUserAccess(573);
              } else {
                return this.checkUserAccess(572);
              }
            } else {
              if (dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if ((dataObject && dataObject.vch_status === 2) || dataObject.status === 3) return false;
                return this.checkUserAccess(573);
              } // insert
              else {
                return this.checkUserAccess(572);
              }
            }
          }
        }
        break;
      }
      case 18: {
        // Qyed
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(555)) {
              this.goTo('/Access/555');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(556);
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(557);
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(561);
          }
          case this.lookupAccessTypeEnum.delete: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(558);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.search:
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(561);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            }
            if (!this.checkUserAccess(556) && dataObject && dataObject.id > 0) {
              return this.checkUserAccess(557) && this.checkUserAccess(559);
            } else if (!this.checkUserAccess(556) && dataObject && dataObject.id === 0) {
              return false;
            } else return this.checkUserAccess(559);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(560);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return this.checkUserAccess(573);
              } else {
                return this.checkUserAccess(572);
              }
            } else {
              if (dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if ((dataObject && dataObject.vch_status === 2) || dataObject.status === 3) return false;
                return this.checkUserAccess(557);
              } // insert
              else {
                return this.checkUserAccess(556);
              }
            }
          }
        }
        break;
      }
      case 17: {
        // Qabd
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(534)) {
              this.goTo('/Access/534');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(535);
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(536);
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(540);
          }
          case this.lookupAccessTypeEnum.delete: {
            // if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
            //   if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            // }
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(537);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.search:
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(540);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            }
            if (!this.checkUserAccess(535) && dataObject && dataObject.id > 0) {
              return this.checkUserAccess(536) && this.checkUserAccess(538);
            } else if (!this.checkUserAccess(535) && dataObject && dataObject.id === 0) {
              return false;
            } else return this.checkUserAccess(538);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(539);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return this.checkUserAccess(536);
              } else {
                return this.checkUserAccess(535);
              }
            } else {
              if (dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if ((dataObject && dataObject.vch_status === 2) || dataObject.status === 3) return false;
                return this.checkUserAccess(536);
              } // insert
              else {
                return this.checkUserAccess(535);
              }
            }
          }
        }
        break;
      }
      case 16: {
        // sarf
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(542)) {
              this.goTo('/Access/542');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(543);
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(544);
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(548);
          }
          case this.lookupAccessTypeEnum.delete: {
            // if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
            //   if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            // }
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(545);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.search:
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(548);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            }
            if (!this.checkUserAccess(543) && dataObject && dataObject.id > 0) {
              return this.checkUserAccess(544) && this.checkUserAccess(546);
            } else if (!this.checkUserAccess(543) && dataObject && dataObject.id === 0) {
              return false;
            } else return this.checkUserAccess(546);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(547);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return this.checkUserAccess(544);
              } else {
                return this.checkUserAccess(543);
              }
            } else {
              if (dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if ((dataObject && dataObject.vch_status === 2) || dataObject.status === 3) return false;
                return this.checkUserAccess(544);
              } // insert
              else {
                return this.checkUserAccess(543);
              }
            }
          }
        }
        break;
      }
      case 19: {
        // عرض سعر
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(598)) {
              this.goTo('/Access/598');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(599);
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(600);
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(603);
          }
          case this.lookupAccessTypeEnum.delete: {
            // if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
            //   if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            // }
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(601);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.search:
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(603);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.offer_status_id === 2 || dataObject.offer_status_id + '' === '4' || dataObject.status === 3) return false;
            }
            if (!this.checkUserAccess(599) && dataObject && dataObject.id > 0) {
              return this.checkUserAccess(600) && this.checkUserAccess(899);
            } else if (!this.checkUserAccess(599) && dataObject && dataObject.id === 0) {
              return false;
            } else return this.checkUserAccess(899);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(602);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return this.checkUserAccess(600);
              } else {
                return this.checkUserAccess(599);
              }
            } else {
              if (dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if ((dataObject && (dataObject.offer_status_id === 2 || dataObject.offer_status_id + '' === '4')) || dataObject.status === 3)
                  return false;
                return this.checkUserAccess(600);
              } // insert
              else {
                return this.checkUserAccess(599);
              }
            }
          }
        }
        break;
      }
      case 20: {
        //  طلبية مبيعات
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(701)) {
              this.goTo('/Access/701');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(696);
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(697);
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(700);
          }
          case this.lookupAccessTypeEnum.delete: {
            // if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
            //   if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            // }
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(698);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.search:
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(700);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.order_status_id === 2 || dataObject.status === 3) return false;
            }
            if (!this.checkUserAccess(696) && dataObject && dataObject.id > 0) {
              return this.checkUserAccess(697) && this.checkUserAccess(900);
            } else if (!this.checkUserAccess(696) && dataObject && dataObject.id === 0) {
              return false;
            } else return this.checkUserAccess(900);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(703);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return this.checkUserAccess(697);
              } else {
                return this.checkUserAccess(696);
              }
            } else {
              if (dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if ((dataObject && dataObject.order_status_id === 2) || dataObject.status === 3) return false;
                return this.checkUserAccess(697);
              } // insert
              else {
                return this.checkUserAccess(696);
              }
            }
          }
        }
        break;
      }
      case 21: {
        //  طلبية مشتريات
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(710)) {
              this.goTo('/Access/710');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(705); //628
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(706); //706
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(709);
          }
          case this.lookupAccessTypeEnum.delete: {
            // if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
            //   if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            // }
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(707);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.search:
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(709);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.order_status_id === 2 || dataObject.status === 3) return false;
            }
            if (!this.checkUserAccess(706) && dataObject && dataObject.id > 0) {
              return false;
            } else if (!this.checkUserAccess(705) && dataObject && dataObject.id === 0) {
              return false;
            } else return this.checkUserAccess(901);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(712);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return this.checkUserAccess(706);
              } else {
                return this.checkUserAccess(705);
              }
            } else {
              if (dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if ((dataObject && dataObject.order_status_id === 2) || dataObject.status === 3) return false;
                return this.checkUserAccess(706);
              } // insert
              else {
                return this.checkUserAccess(705);
              }
            }
          }
        }
        break;
      }
      case 9: {
        // سند ادخال بضاعة
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(667)) {
              this.goTo('/Access/667');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(668);
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(669);
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(673);
          }
          case this.lookupAccessTypeEnum.delete: {
            // if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
            //   if (dataObject.vch_status === 2 || dataObject.status === 3) return false;
            // }
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(670);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.search:
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(673);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.vch_status_id === 2 || dataObject.status === 3) return false;
            }

            if (!this.checkUserAccess(671) && dataObject && dataObject.id > 0) {
              return this.checkUserAccess(600) && this.checkUserAccess(718);
            } else if (!this.checkUserAccess(671) && dataObject && dataObject.id === 0) {
              return false;
            } else return this.checkUserAccess(671);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(672);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return this.checkUserAccess(668);
              } else {
                return this.checkUserAccess(669);
              }
            } else {
              if (dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if (
                  (dataObject && dataObject.vch_status_id === 2) ||
                  dataObject.status === 3 ||
                  (dataObject.internal_voucher_id && dataObject.internal_voucher_id + '' !== '0')
                )
                  return false;
                return this.checkUserAccess(669);
              } // insert
              else {
                return this.checkUserAccess(668);
              }
            }
          }
        }
        break;
      }
      case 10: {
        // سند اخراج بضاعة
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(659)) {
              this.goTo('/Access/659');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(660);
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(661);
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(665);
          }
          case this.lookupAccessTypeEnum.delete: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(662);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.search:
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(665);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.vch_status_id === 2 || dataObject.status === 3) return false;
            }

            if (!this.checkUserAccess(671) && dataObject && dataObject.id > 0) {
              return this.checkUserAccess(600) && this.checkUserAccess(718);
            } else if (!this.checkUserAccess(663) && dataObject && dataObject.id === 0) {
              return false;
            } else return this.checkUserAccess(663);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(664);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return this.checkUserAccess(660);
              } else {
                return this.checkUserAccess(661);
              }
            } else {
              if (dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if (
                  (dataObject && dataObject.vch_status_id === 2) ||
                  dataObject.status === 3 ||
                  (dataObject.internal_voucher_id && dataObject.internal_voucher_id + '' !== '0')
                )
                  return false;
                return this.checkUserAccess(661);
              } // insert
              else {
                return this.checkUserAccess(660);
              }
            }
          }
        }
        break;
      }
      case 11: {
        // سند استعمال
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(812)) {
              this.goTo('/Access/659');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(813);
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(814);
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(818);
          }
          case this.lookupAccessTypeEnum.delete: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(662);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.search:
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(818);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.vch_status_id === 2 || dataObject.status === 3) return false;
            }

            if (!this.checkUserAccess(813) && dataObject && dataObject.id > 0) {
              return this.checkUserAccess(814) && this.checkUserAccess(816);
            } else if (!this.checkUserAccess(813) && dataObject && dataObject.id === 0) {
              return false;
            } else return this.checkUserAccess(816);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(664);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return this.checkUserAccess(813);
              } else {
                return this.checkUserAccess(814);
              }
            } else {
              if (dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if (
                  (dataObject && dataObject.vch_status_id === 2) ||
                  dataObject.status === 3 ||
                  (dataObject.internal_voucher_id && dataObject.internal_voucher_id + '' !== '0')
                )
                  return false;
                return this.checkUserAccess(814);
              } // insert
              else {
                return this.checkUserAccess(813);
              }
            }
          }
        }
        break;
      }
      case 12: {
        // ارسالية داخلية
        switch (accessType) {
          case this.lookupAccessTypeEnum.loginToPage: {
            if (!this.checkUserAccess(651)) {
              this.goTo('/Access/651');
              return false;
            }
            break;
          }
          case this.lookupAccessTypeEnum.insert: {
            return this.checkUserAccess(652);
          }
          case this.lookupAccessTypeEnum.edit: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(653);
          }
          case this.lookupAccessTypeEnum.refresh: {
            return this.checkUserAccess(657);
          }
          case this.lookupAccessTypeEnum.delete: {
            if (dataObject.status === 3) return false;
            return this.checkUserAccess(654);
          }
          case this.lookupAccessTypeEnum.log: {
            return this.checkUserAccess(9);
          }
          case this.lookupAccessTypeEnum.search:
          case this.lookupAccessTypeEnum.nextPrev: {
            return this.checkUserAccess(657);
          }
          case this.lookupAccessTypeEnum.postVocuher: {
            if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
              if (dataObject.vch_status_id === 2 || dataObject.status === 3) return false;
            }

            if (!this.checkUserAccess(671) && dataObject && dataObject.id > 0) {
              return this.checkUserAccess(600) && this.checkUserAccess(718);
            } else if (!this.checkUserAccess(655) && dataObject && dataObject.id === 0) {
              return false;
            } else return this.checkUserAccess(655);
          }
          case this.lookupAccessTypeEnum.print: {
            return this.checkUserAccess(656);
          }
          case this.lookupAccessTypeEnum.checkUserByMode: {
            if (approved) {
              if (dataObject && dataObject.id > 0 && !dataObject.is_edit) {
                return this.checkUserAccess(652);
              } else {
                return this.checkUserAccess(653);
              }
            } else {
              if (dataObject.id > 0 && !dataObject.is_edit) {
                // update
                if (
                  (dataObject && dataObject.vch_status_id === 2) ||
                  dataObject.status === 3 ||
                  (dataObject.internal_voucher_id && dataObject.internal_voucher_id + '' !== '0')
                )
                  return false;
                return this.checkUserAccess(660);
              } // insert
              else {
                return this.checkUserAccess(661);
              }
            }
          }
        }
        break;
      }
      default: {
        break;
      }
    }
    return true;
  },
  setCurrentRow(grid) {
    let index = 0;
    try {
      if (grid && grid.flex) {
        index = grid.flex.selection.row;
      }
      if (index < 0) {
        index = 0;
      }
    } catch (e) { }
    return index;
  },
  cheques: {
    In: 1, // شيكات واردة
    Out: 2, // شيكات صادرة
  },
  getChequesOperations(chequesType) {
    if (chequesType === this.cheques.In) {
      return [
        { id: 1, name: $.strings.chequesOperations.searchCheques }, // بحث شيكات  608
        { id: 2, name: $.strings.chequesOperations.chequesDeposit }, //	610 ايداع شيكات
        { id: 3, name: $.strings.chequesOperations.changeChequesDueDate }, // 619 تغيير تاريخ استحقاق شيك
        { id: 4, name: $.strings.chequesOperations.returnChequesToSource }, // 616 ارجاع شيك للمصدر
        { id: 5, name: $.strings.chequesOperations.returnChequesFromBank }, // 615 ارجاع شيك من البنك
        { id: 6, name: $.strings.chequesOperations.transferEndorsementCheques }, // 613 تحويل / تجيير شيك
        { id: 7, name: $.strings.chequesOperations.returnTransferedCheques }, // 614 ارجاع شيك محول أو مجير
        { id: 8, name: $.strings.chequesOperations.retrievingChequesFromCustomer }, // 617 استرجاع شيك من عميل
        { id: 9, name: $.strings.chequesOperations.transferChequesToCollectionAccount }, // 611 تحويل شيك الى حساب التحصيل
        { id: 10, name: $.strings.chequesOperations.withdrawCustomerChequesForCash }, // 612 سحب شيك عميل نقدا
        { id: 11, name: $.strings.chequesOperations.transferChequesToOtherAccount }, // 618 تحويل شيك الى حساب اخر
      ];
    } else {
      return [
        { id: 1, name: $.strings.chequesOperations.searchCheques }, // 620 بحث شيكات
        { id: 12, name: $.strings.chequesOperations.chequeOut }, // 622 اخراج شيك مستحق من البنك
        { id: 13, name: $.strings.chequesOperations.returnChequeFromBankToSupplier }, // 623 إرجاع البنك شيك إلى المورد
        { id: 14, name: $.strings.chequesOperations.returnChequeFromSupplier }, // 624 إسترجاع شيك من المورد
        { id: 15, name: $.strings.chequesOperations.chequeOutReturnedChequeAgain }, // 625 إعادة صرف شيك مرتجع للمورد
        { id: 16, name: $.strings.chequesOperations.postponementCheque }, // 626  تغيير تاريخ إستحقاق شيك
      ];
    }
  },
  getVoucherSettingIdByVchType(voucher_type_id, setting_id) {
    let result = voucher_type_id * 1000 + 10000 + setting_id;
    return result;
  },
  getYearRange() {
    let years = [];
    let maxYear = new Date().getFullYear() + 10;
    for (let index = 1980; index <= maxYear; index++) {
      years.push({ id: index, name: index });
    }
    return years;
  },

  copyTypeEnum: {
    copyAll: 1, // نسخ للكل
    copyTop: 2, // نسخ للأعلى
    copyBottom: 3, // نسخ للأسفل
    selectAll: 4, // تحديد للكل
    invertSelection: 5, // عكس التحديد
    unSelectAll: 6, // عدم تحديد للكل
  },
  appendExtraFieldsToGrid(scheme, data, extraFieldsColumnsList) {
    let objKeys = Object.keys(data[0]);
    for (let key = 0; key < objKeys.length; key++) {
      let caption = objKeys[key].replaceAll('_', ' ');
      let extraFieldColumn = extraFieldsColumnsList.find((e) => e.label === caption || e.label_lang2 === caption);
      if (extraFieldColumn) {
        let col = {
          name: objKeys[key],
          header: caption,
          width: 120,
          maxWidth: 120,
          filterType: 'None',
          columnWidth: '2',
          visible: this.visibleExtraFieldColumn(data, objKeys[key]),
          //visibleInColumnChooser: this.visibleExtraFieldColumn(data, objKeys[key]),
        };
        let findColumnByName = scheme.columns.find((c) => c.name === col.name);
        if (!scheme.columns.includes(col) && !findColumnByName) {
          scheme.columns.push(col);
        } else {
          let index = scheme.columns.indexOf((e) => e.name === col.name);
          findColumnByName.visible = col.visible;
          scheme.columns[index] = findColumnByName;
        }
      }
    }
  },
  appendTradeMaksToGrid(scheme, tradeMarkList) {
    for (let key = 0; key < tradeMarkList.length; key++) {
      let col = {
        name: tradeMarkList[key].id + '',
        header: this.getNameByUserLanguage(tradeMarkList[key].name, tradeMarkList[key].name_lang2),
        width: 150,
        maxWidth: 120,
        filterType: 'None',
        columnWidth: '2',
        visible: false,
        visibleInColumnChooser: true,
      };
      scheme.columns.push(col);
    }
    return scheme;
  },

  isValidDouble(str) {
    if (typeof str !== "string") return false;
    return !isNaN(str) && !isNaN(parseFloat(str));
  },
  isValidDate(str) {
    if (typeof str !== "string") return false;

    // Detect separator
    const sep = str.includes("/") ? "/" :
      str.includes("-") ? "-" : null;
    if (!sep) return false;

    const parts = str.split(sep);
    if (parts.length !== 3) return false;

    let day, month, year;

    // --- Possible formats ---
    // yyyy-mm-dd
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    }
    // dd/mm/yyyy or mm/dd/yyyy
    else {
      year = parseInt(parts[2], 10);

      // If both parts ≤ 12 => ambiguous -> assume dd/mm/yyyy first
      const p1 = parseInt(parts[0], 10);
      const p2 = parseInt(parts[1], 10);

      if (p1 > 12) {
        // must be dd/mm/yyyy
        day = p1;
        month = p2;
      } else if (p2 > 12) {
        // must be mm/dd/yyyy
        month = p1;
        day = p2;
      } else {
        // ambiguous → default dd/mm/yyyy
        day = p1;
        month = p2;
      }
    }

    // Validate numeric ranges
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    if (year < 1000 || year > 9999) return false;

    // Final validation using real date
    const d = new Date(year, month - 1, day);
    return (
      d.getFullYear() === year &&
      d.getMonth() + 1 === month &&
      d.getDate() === day
    );
  },
  isValidTime(str) {
    const regex = /^([01]\d|2[0-3]):[0-5]\d$/;
    return regex.test(str);
  },
  getFirstDayInTheYearAsDate() {
    //return first day of current year
    let date = new Date();
    date.setMonth(0);
    date.setDate(1);

    return date;
  },
  handleGridColumns(grid, scheme) {
    let gridColumnList = [];
    if (grid && grid.flex) {
      gridColumnList = grid.flex.columns;
    }
    scheme.columns.forEach((element) => {
      let objColInGrid = gridColumnList.find((c) => c.name === element.name);
      if (objColInGrid) {
        element.visible = objColInGrid.visible || (grid.state.narrow && element.visible);
      }
    });

    return scheme;
  },
  handleGridColumnsWithSettings(grid, scheme, colName, colVisible) {
    scheme.columns.forEach((element) => {
      if (element.name === colName) {
        element.visible = colVisible;
        return scheme;
      }
    });
    return scheme;
  },
  isSpaceOrSymbolsWithoutDot(text) {
    const specialChars = /[`!@#$%^&*()_+\-=\\[\]{};':"\\|,<>\\/?~]/;
    let result = specialChars.test(text);
    if (!result) {
      result = /\s/g.test(text);
    }
    return result;
  },

  chequesOperationsBulkEnum: {
    InChequesDeposit: 1, // ايداع الشيكات الواردة
    OutChequesIssuance: 2, // اخراج الشيكات صادرة
    ChequesEndorsement: 3, // تجيير الشيكات
    ChangeChequesHolder: 4, // تعديل حائز الشيك
    ChangeChequesAccount: 5, // تحويل شيكات من صندوق الى اخر
  },
  sendMessagesByEnum: {
    email: 0,
    whatsApp: 1,
  },
  getCheqTypesList() {
    let chequeTypeList = [];

    if (this.checkUserAccess(620))
      chequeTypeList.splice(0, 0, { id: 2, name: $.strings.chequesOperationsBulk.outCheq, name_lang2: $.strings.chequesOperationsBulk.outCheq });

    if (this.checkUserAccess(608))
      chequeTypeList.splice(0, 0, { id: 1, name: $.strings.chequesOperationsBulk.inCheq, name_lang2: $.strings.chequesOperationsBulk.inCheq });

    if (chequeTypeList && chequeTypeList.length > 1) {
      chequeTypeList.splice(0, 0, { id: 0, name: $.strings.all, name_lang2: $.strings.all });
    }
    return chequeTypeList;
  },
  getStockTakingStatusList() {
    return [
      { id: 1, name: $.strings.stockTaking.active, name_lang2: $.strings.stockTaking.active },
      { id: 2, name: $.strings.stockTaking.fixed, name_lang2: $.strings.stockTaking.fixed },
      { id: 3, name: $.strings.stockTaking.posted, name_lang2: $.strings.stockTaking.posted },
    ];
  },
  getStockTakingMatchingList() {
    return [
      { id: 1, name: $.strings.stockTakingSessions.notMatched, name_lang2: $.strings.stockTakingSessions.notMatched },
      { id: 2, name: $.strings.stockTakingSessions.closedForMatching, name_lang2: $.strings.stockTakingSessions.closedForMatching },
    ];
  },
  getAllowStockTransList() {
    return [
      { id: 1, name: $.strings.stockTakingSessions.notAllowed, name_lang2: $.strings.stockTakingSessions.notAllowed },
      { id: 2, name: $.strings.stockTakingSessions.allowed, name_lang2: $.strings.stockTakingSessions.allowed },
    ];
  },
  getShowItemsList() {
    return [
      { id: 1, name: $.strings.all, name_lang2: $.strings.all },
      { id: 2, name: $.strings.stockTakingTrans.hasBalanceNoStockTaking, name_lang2: $.strings.stockTakingTrans.hasBalanceNoStockTaking },
      { id: 3, name: $.strings.stockTakingTrans.hasStockTakingOnly, name_lang2: $.strings.stockTakingTrans.hasStockTakingOnly },
      {
        id: 4,
        name: $.strings.stockTakingTrans.noStockTakingInThisSessionInStore,
        name_lang2: $.strings.stockTakingTrans.noStockTakingInThisSessionInStore,
      },
      {
        id: 5,
        name: $.strings.stockTakingTrans.noStockTakingInAllSessionsInStore,
        name_lang2: $.strings.stockTakingTrans.noStockTakingInAllSessionsInStore,
      },
    ];
  },
  getItemTypes(voucherType) {
    let values = [
      { id: 1, name: $.strings.offerPrice.itemType1, name_lang2: $.strings.offerPrice.itemType1 },
      { id: 2, name: $.strings.offerPrice.itemType2, name_lang2: $.strings.offerPrice.itemType2 },
      { id: 3, name: $.strings.offerPrice.itemType3, name_lang2: $.strings.offerPrice.itemType3 },
    ];
    if (
      voucherType &&
      (voucherType === this.voucherTypeEnum.deliveryConsignmentSale ||
        voucherType === this.voucherTypeEnum.deliveryPay ||
        voucherType === this.voucherTypeEnum.deliverySell ||
        voucherType === this.voucherTypeEnum.returnDeliveryConsignmentSale)
    )
      values = [
        { id: 1, name: $.strings.offerPrice.itemType1, name_lang2: $.strings.offerPrice.itemType1 },
        { id: 2, name: $.strings.offerPrice.itemType2, name_lang2: $.strings.offerPrice.itemType2 },
      ];
    return values;
  },
  getItemDeliveryTypes() {
    let values = [
      { id: 1, name: $.strings.offerPrice.itemType1, name_lang2: $.strings.offerPrice.itemType1 },
      { id: 2, name: $.strings.offerPrice.itemType2, name_lang2: $.strings.offerPrice.itemType2 },
    ];
    return values;
  },
  getPricesTypes() {
    let values = [
      { id: 1, name: $.strings.stockIn.pricesType1, name_lang2: $.strings.stockIn.pricesType1 },
      { id: 2, name: $.strings.stockIn.pricesType2, name_lang2: $.strings.stockIn.pricesType2 },
      { id: 3, name: $.strings.stockIn.pricesType3, name_lang2: $.strings.stockIn.pricesType3 },
      { id: 4, name: $.strings.stockIn.pricesType4, name_lang2: $.strings.stockIn.pricesType4 },
      { id: 5, name: $.strings.stockIn.pricesType5, name_lang2: $.strings.stockIn.pricesType5 },
    ];
    return values;
  },
  getItemsOtherOptionsFilter(obj) {
    let objFilter = {
      main_stock_list: [],
      stock_type_list: [],
      price_category_list: [],
      has_serial: 0,
      has_size: 0,
      danger_material: 0,
      has_color: 0,
      excluded_from_discount: 0,
      tradeMarkDetailList: [],
      salesman_list: [],
      stores_list: [],
      items_locations_list: [],
    };
    if (obj && obj.main_stock_list && obj.main_stock_list.length > 0) {
      obj.main_stock_list.forEach((element) => {
        objFilter.main_stock_list.push(element.id);
      });
    }
    if (obj && obj.stock_type_list && obj.stock_type_list.length > 0) {
      obj.stock_type_list.forEach((element) => {
        objFilter.stock_type_list.push(element.id);
      });
    }
    if (obj && obj.price_category_list && obj.price_category_list.length > 0) {
      obj.price_category_list.forEach((element) => {
        objFilter.price_category_list.push(element.id);
      });
    }
    if (obj && obj.has_serial) {
      objFilter.has_serial = obj.has_serial.id;
    }
    if (obj && obj.has_size && obj.has_size.length > 0) {
      objFilter.has_size = obj.has_size.id;
    }
    if (obj && obj.danger_material && obj.danger_material.length > 0) {
      objFilter.danger_material = obj.danger_material.id;
    }
    if (obj && obj.has_color && obj.has_color.length > 0) {
      objFilter.has_color = obj.has_color.id;
    }
    if (obj && obj.excluded_from_discount && obj.excluded_from_discount.length > 0) {
      objFilter.excluded_from_discount = obj.excluded_from_discount.id;
    }
    if (obj && obj.tradeMarkDetailList && obj.tradeMarkDetailList.length > 0) {
    }
    if (obj && obj.salesman_list && obj.salesman_list.length > 0) {
      obj.salesman_list.forEach((element) => {
        objFilter.salesman_list.push(element.id);
      });
    }
    if (obj && obj.stores_list && obj.stores_list.length > 0) {
      obj.stores_list.forEach((element) => {
        objFilter.stores_list.push(element.id);
      });
    }
    if (obj && obj.items_locations_list && obj.items_locations_list.length > 0) {
      obj.items_locations_list.forEach((element) => {
        objFilter.items_locations_list.push(element.id);
      });
    }

    return objFilter;
  },
  ItemDetailsScreenTypeEnum: {
    showBoth: 1,
    showSell: 2,
    showPay: 3,
    unVisible: 0,
  },
  CheckTypeEnum: {
    ReceivedChecks: 1,
    IssuedChecks: 2,
  },

  appendTradeMarksToItemsGrid(scheme, data) {
    let objKeys = Object.keys(data[0]);
    for (let key = 0; key < objKeys.length; key++) {
      if (!objKeys[key].includes('=')) continue;
      let caption = objKeys[key].replaceAll('=', ' ');
      let col = {
        name: objKeys[key],
        header: caption,
        width: 120,
        maxWidth: 120,
        filterType: 'None',
        columnWidth: '2',
        visible: this.visibleExtraFieldColumn(data, objKeys[key]),
      };
      let isFound = scheme.columns.find((e) => e.name === col.name);
      if (!isFound) scheme.columns.push(col);
    }
  },

  isSpaceOrSymbolsWithoutDotAndMinus(text) {
    const specialChars = /[`!@#$%^&*()_+\=\\[\]{};':"\\|,<>\\/?~]/;
    let result = specialChars.test(text);
    if (!result) {
      result = /\s/g.test(text);
    }
    return result;
  },
  bankSettlementJouranlsTypesEnum: {
    bankReceipt: 17,
    bankPayment: 16,
    commissionJournals: 18,
  },
  codeRangeFilterEnum: {
    accounts: 1,
    items: 2,
  },
  getAllowedKeys() {
    let allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Control'];
    return allowedKeys;
  },
  async checkAccountWhenSave(e, account_id, account_currency_id, credit_debit, page_id, voucherCurrencyId, voucherTypeEnum, amount) {
    let ValidateObj = { isAlertMessage: false, isStoppedMessage: false, msg: 'ahmad', showMsg: false };
    let dataValidateAccount = await this.checkAccount(
      account_id,
      account_currency_id,
      page_id,
      voucherCurrencyId,
      voucherTypeEnum,
      amount,
      credit_debit,
      true
    );

    if (dataValidateAccount && !dataValidateAccount.successful) {
      ValidateObj.msg = dataValidateAccount.message;
      if (dataValidateAccount._obj.is_father || dataValidateAccount._obj.account_stop || dataValidateAccount._obj.valid_currency + '' === '1') {
        ValidateObj.isStoppedMessage = true;
        ValidateObj.showMsg = true;
      }
    }
    if (dataValidateAccount) {
      if (dataValidateAccount._obj.valid_currency + '' === '1') {
        ValidateObj.isAlertMessage = true;
        ValidateObj.showMsg = true;
        ValidateObj.msg = dataValidateAccount.message;
      }
      if (dataValidateAccount._obj.valid_max_balance_amount + '' === '1') {
        ValidateObj.isAlertMessage = true;
        ValidateObj.showMsg = true;
        ValidateObj.msg = dataValidateAccount.message;
      }
      if (dataValidateAccount._obj.valid_max_transaction_amount + '' === '1') {
        ValidateObj.isAlertMessage = true;
        ValidateObj.showMsg = true;
        ValidateObj.msg = dataValidateAccount.message;
      }
      if (dataValidateAccount._obj.valid_credit_account + '' === '2' || dataValidateAccount._obj.valid_debit_account + '' === '2') {
        ValidateObj.isAlertMessage = true;
        ValidateObj.showMsg = true;
        ValidateObj.msg = dataValidateAccount.message;
      }
    }
    return ValidateObj;
  },
  getTimeOnly(date) {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const time = `${hours}:${minutes}:${seconds}`;
    return time;
  },
  assetsTransTypeEnum: {
    none: 0,
    changeAssetLocation: 1,
    execludeAssets: 2,
    changeAssetCustody: 3,
    destroyAsset: 4,
    printAssetsLabel: 5,
  },

  generateSerials(startSerial, endSerial) {
    const serials = [];

    // Extract the numeric and non-numeric parts from the start and end serial numbers
    const startNumericPart = startSerial.toString().match(/\d+$/)[0];
    const endNumericPart = endSerial.toString().match(/\d+$/)[0];

    // Convert the numeric parts to integers
    const startNumber = parseInt(startNumericPart, 10);
    const endNumber = parseInt(endNumericPart, 10);

    // Pad the numeric parts with leading zeros to match the original lengths
    // const paddedStartNumericPart = startNumber.toString().padStart(startNumericPart.length, "0");
    // const paddedEndNumericPart = endNumber.toString().padStart(endNumericPart.length, "0");

    // Generate the serials between the start and end serial numbers
    for (let i = startNumber; i <= endNumber; i++) {
      const incrementedNumericPart = i.toString().padStart(startNumericPart.length, '0');
      const generatedSerial = startSerial.replace(startNumericPart, incrementedNumericPart);
      serials.push(generatedSerial);
    }

    return serials;
  },
  addDays(date, numberOfDays) {
    // Ensure that numberOfDays is a positive integer
    numberOfDays = Math.max(0, Math.floor(numberOfDays));

    let result = new Date(date);

    // Calculate the number of full years to add
    let fullYears = Math.floor(numberOfDays / 365);

    // Calculate the remaining days after adding full years
    let remainingDays = numberOfDays % 365;

    // Set the full years
    result.setFullYear(result.getFullYear() + fullYears);

    // Add the remaining days
    result.setDate(result.getDate() + remainingDays);

    return result;
  },
  getCompatibleStatus(compatible_status_id) {
    switch (compatible_status_id) {
      case 1:
        return $.strings.assetsStockTakingTrans.compatible;
      case 2:
        return $.strings.assetsStockTakingTrans.existInOtherLocation;
      case 3:
        return $.strings.assetsStockTakingTrans.notExist;
      case 4:
        return $.strings.assetsStockTakingTrans.existInSameStockTaking;
      default:
        return '';
    }
  },
  getDateAsHHMM(date) {
    const formattedTime = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false // Use 24-hour format
    }).format(date);

    return formattedTime;
  },
  gridDateTimeFormat() {
    return 'dd/MM/yyyy HH:mm:ss';
  },

  getNumberByTimeFormatString(value) {
    let time = value.split('T')[1];
    let Hours = time.split(':')[0];
    let Minutes = time.split(':')[1];

    let obj = { hours: Hours, minutes: Minutes };

    if (obj.hours.toString().length === 1) obj.hours = '0' + obj.hours;
    if (obj.minutes.toString().length === 1) obj.minutes = '0' + obj.minutes;
    return String(obj.hours).padStart(2, '0') + ':' + String(obj.minutes).padStart(2, '0');
  },
  getAccountClassifications(classifications) {
    let classifications_ids = [];
    if (classifications) {
      const keys = Object.keys(classifications);
      for (const key of keys) {
        if (classifications[key].checked) {
          if (key.toString().includes('-')) {
            classifications_ids.push(key.split('-')[1]);
          } else {
            classifications_ids.push(key);
          }
        }
      }
    }
    return classifications_ids;
  },

  calcPriceWithOutTax(price_with_tax, vat) {
    let vat_percent = vat;
    if (vat_percent === undefined) vat_percent = 0;
    if (vat_percent > 0) vat_percent = vat_percent / 100;
    let price = price_with_tax;
    if (price === undefined) price = 0;
    let price_with_out_tax = price / (1 + vat_percent);
    if (!price_with_out_tax) price_with_out_tax = 0;
    return price_with_out_tax;
  },
  calcPriceWithTax(price_with_out_tax, vat) {
    let vat_percent = vat;
    if (vat_percent === undefined) vat_percent = 0;
    if (vat_percent > 0) vat_percent = vat_percent / 100;
    let price = price_with_out_tax;
    if (price === undefined) price = 0;
    let price_with_tax = price * (1 + vat_percent);
    if (!price_with_tax) price_with_tax = 0;
    return price_with_tax;
  },
  importOperationTypeEnum: {
    insertOnly: 1,
    updateOnly: 2,
    insertUpdate: 3,
  },
  isDateValid(date) {
    try {
      let dateObj = new Date(date);
      if (dateObj + '' === 'Invalid Date') return false;
      else return true;
    } catch {
      return false;
    }
  },
  ViewVoucher(voucherId, voucherType, pathDepth) {
    if (!voucherId || voucherId <= 0) return;
    switch (voucherType) {
      case this.voucherTypeEnum.salesInvoice:
        this.goToNewTab('Delivery/SalesInvoice/' + voucherId);
        break;
      case this.voucherTypeEnum.deliverySell:
        this.goToNewTab('Delivery/DeliverySell/' + voucherId);
        break;
      case this.voucherTypeEnum.deliveryConsignmentSale:
        this.goToNewTab('Delivery/DeliveryConsignmentSale/' + voucherId);
        break;
      case this.voucherTypeEnum.returnDeliveryConsignmentSale:
        this.goToNewTab('Delivery/returnDeliveryConsignmentSale/' + voucherId);
        break;
      case this.voucherTypeEnum.returnSell:
        this.goToNewTab('Delivery/returnSell/' + voucherId);
        break;
      case this.voucherTypeEnum.purchaseInvoice:
        this.goToNewTab('Delivery/PurchaseInvoice/' + voucherId);
        break;
      case this.voucherTypeEnum.deliveryPay:
        this.goToNewTab('Delivery/DeliveryPay/' + voucherId);
        break;
      case this.voucherTypeEnum.returnPurchase:
        this.goToNewTab('Delivery/returnPurchase/' + voucherId);
        break;
      case this.voucherTypeEnum.stockIn:
        this.goToNewTab('Vouchers/StockInVoucher/' + voucherId);
        break;
      case this.voucherTypeEnum.stockOut:
        this.goToNewTab('Vouchers/StockOutVoucher/' + voucherId);
        break;
      case this.voucherTypeEnum.useVoucher:
        this.goToNewTab('Vouchers/UseVoucher/' + voucherId);
        break;
      case this.voucherTypeEnum.internalDelivery:
        this.goToNewTab('Vouchers/InternalDelivery/' + voucherId);
        break;
      case this.voucherTypeEnum.credit:
        this.goToNewTab('Vouchers/CreditNote/' + voucherId);
        break;
      case this.voucherTypeEnum.debit:
        this.goToNewTab('Vouchers/DebitNote/' + voucherId);
        break;
      case this.voucherTypeEnum.qabd:
        this.goToNewTab('Vouchers/QabdVoucher/' + voucherId);
        break;
      case this.voucherTypeEnum.sarf:
        this.goToNewTab('Vouchers/SarfVoucher/' + voucherId);
        break;
      case this.voucherTypeEnum.journal:
        this.goToNewTab('Vouchers/JournalVoucher/' + voucherId);
        break;
      case this.voucherTypeEnum.offerPrice:
        this.goToNewTab('Offers/OfferPrice/' + voucherId);
        break;
      case this.voucherTypeEnum.sellOrder:
        this.goToNewTab('Orders/SellOrders/' + voucherId);
        break;
      case this.voucherTypeEnum.purchaseOrder:
        this.goToNewTab('Orders/PayOrders/' + voucherId);
        break;
      default:
        break;
    }
  },

  visibleColumnWithDate(data, columnName) {
    let result = data.filter((e) => e[columnName] && e[columnName].length > 0).length > 0;
    return result;
  },
  postVouchersEnum: {
    post: 1,
    print: 2,
    postAndPrint: 3,
    printVouchersJournals: 4,
  },
  getVoucherStatus() {
    let values = [
      { id: 1, name: $.strings.manualOrRelatedVoucher.voucherStatusDraft, name_lang2: $.strings.manualOrRelatedVoucher.voucherStatusDraft },
      { id: 2, name: $.strings.manualOrRelatedVoucher.voucherStatusPost, name_lang2: $.strings.manualOrRelatedVoucher.voucherStatusPost },
      { id: 3, name: $.strings.manualOrRelatedVoucher.voucherStatusDeleted, name_lang2: $.strings.manualOrRelatedVoucher.voucherStatusDeleted },
    ];
    return values;
  },
  getCustomersAdditionalOptions(additionalFilters) {
    let additional_options = {
      salesman_ids: [],
      customer_type_ids: [],
      customer_level_ids: [],
      classification_ids: [],
      price_category_ids: [],
      region_id: 0,
      subRegions: false,
    };
    if (additionalFilters.salesman) {
      additionalFilters.salesman.forEach((element) => {
        additional_options.salesman_ids.push(element.id);
      });
    }

    if (additionalFilters.customerType) {
      additionalFilters.customerType.forEach((element) => {
        additional_options.customer_type_ids.push(element.account_type_id);
      });
    }

    if (additionalFilters.customerLevel) {
      additionalFilters.customerLevel.forEach((element) => {
        additional_options.customer_level_ids.push(element.id);
      });
    }

    if (additionalFilters.classification) {
      additionalFilters.classification.forEach((element) => {
        additional_options.classification_ids.push(element.id);
      });
    }

    if (additionalFilters.priceCategory) {
      additionalFilters.priceCategory.forEach((element) => {
        additional_options.price_category_ids.push(element.id);
      });
    }

    if (additionalFilters.region) {
      additional_options.region_id = additionalFilters.region.id;
    }

    if (additionalFilters.subRegions) additional_options.subRegions = additionalFilters.subRegions;

    return additional_options;
  },
  assetLabelEnum: {
    assets_label_name_barcode: 1,
    assets_label_name_barcode_co: 2,
    assets_label_name_barcode_loc: 3,
  },
  getVocuherStatusId(voucherStatusFilter) {
    switch (voucherStatusFilter) {
      case $.strings.VoucherSearch.approved: {
        return 2;
      }
      case $.strings.VoucherSearch.draft: {
        return 1;
      }
      default: {
        return -1;
      }
    }
  },

  getSalaryItems(withAll) {
    let result = [];
    if (withAll) {
      result.push({ id: 0, name: $.strings.all });
    }
    result.push({ id: 1, name: $.strings.salaryItems.basicSalary });
    result.push({ id: 2, name: $.strings.salaryItems.additionToSalary });
    result.push({ id: 3, name: $.strings.salaryItems.deductionFromSalary });
    return result;
  },
  getAmountPeriod(withAll) {
    let result = [];
    if (withAll) {
      result.push({ id: 0, name: $.strings.all });
    }
    result.push({ id: 1, name: $.strings.salaryItems.monthly });
    result.push({ id: 2, name: $.strings.salaryItems.daily });

    return result;
  },
  getTaxExemptionType() {
    return [
      { id: 1, name: $.strings.taxExemption.annual },
      { id: 2, name: $.strings.taxExemption.monthly },
    ];
  },
  getAmountTypes() {
    return [
      { id: 1, name: $.strings.taxExemption.amountType },
      { id: 2, name: $.strings.taxExemption.countType },
    ];
  },
  getMaxAmountTypes() {
    return [
      { id: 1, name: $.strings.taxExemption.amountType },
      { id: 2, name: $.strings.taxExemption.percent },
    ];
  },
  getContractTypes(withAll) {
    let result = [];
    if (withAll) {
      result.push({ id: 0, name: $.strings.all });
    }
    result.push({ id: 1, name: $.strings.employees.fixed });
    result.push({ id: 2, name: $.strings.employees.partTime });

    return result;
  },
  getContractTypeById(id) {
    switch (id) {
      case 1: {
        return $.strings.employees.fixed;
      }
      case 2: {
        return $.strings.employees.partTime;
      }
    }
  },
  getGenderName(id) {
    switch (id) {
      case 1: {
        return $.strings.employees.male;
      }
      case 2: {
        return $.strings.employees.female;
      }
    }
  },
  getEmpStatusList(withAll) {
    let result = [];
    if (withAll) {
      result.push({ id: 0, name: $.strings.all });
    }
    result.push({ id: 1, name: $.strings.employees.staff });
    result.push({ id: 2, name: $.strings.employees.endedServices });
    return result;
  },
  getSocialStatusList(withAll) {
    let result = [];
    if (withAll) {
      result.push({ id: 0, name: $.strings.all });
    }
    result.push({ id: 1, name: $.strings.employees.single });
    result.push({ id: 2, name: $.strings.employees.married });
    result.push({ id: 3, name: $.strings.employees.divorced });
    result.push({ id: 4, name: $.strings.employees.Widower });
    return result;
  },
  getSocialStatusName(id) {
    switch (id) {
      case 1: {
        return $.strings.employees.single;
      }
      case 2: {
        return $.strings.employees.married;
      }
      case 3: {
        return $.strings.employees.divorced;
      }
      case 4: {
        return $.strings.employees.Widower;
      }
    }
  },
  getSalaryTypesList(withAll) {
    let result = [];
    if (withAll) {
      result.push({ id: 0, name: $.strings.all });
    }
    result.push({ id: 1, name: $.strings.employees.monthly });
    result.push({ id: 2, name: $.strings.employees.daily });
    result.push({ id: 3, name: $.strings.employees.hour });

    return result;
  },
  checkStopTransactionsAreSame(listReal, listOld) {
    // Check if the lengths of the lists are different
    if (listReal.length !== listOld.length) {
      return false;
    }

    listReal.sort((a, b) => (JSON.stringify(a) > JSON.stringify(b) ? 1 : -1));
    listOld.sort((a, b) => (JSON.stringify(a) > JSON.stringify(b) ? 1 : -1));

    // Compare each object in the lists
    for (let i = 0; i < listReal.length; i++) {
      if (JSON.stringify(listReal[i]) !== JSON.stringify(listOld[i])) {
        return false;
      }
    }
    // If all objects are the same, return true
    return true;
  },
  getGenderList(withAll) {
    let result = [];
    if (withAll) {
      result.push({ id: 0, name: $.strings.all });
    }
    result.push({ id: 1, name: $.strings.employees.male });
    result.push({ id: 2, name: $.strings.employees.female });
    return result;
  },
  getYearsList() {
    let result = [];
    for (let index = 1990; index <= 2099; index++) {
      result.push({ id: index, name: index });
    }
    return result;
  },
  appendSalaryItemsToGrid(scheme, data) {
    let objKeys = Object.keys(data[0]);
    for (let key = 0; key < objKeys.length; key++) {
      console.info('wwwwwwwwww', objKeys[key])
      if (!objKeys[key].includes('=')) continue;
      if (objKeys[key].startsWith('Exemption_')) continue;
      let caption = objKeys[key].replaceAll('=', ' ');
      let colVisible = false;
      let res = data.filter((e) => e[objKeys[key]] !== null && (e[objKeys[key]] + '').trim() !== '');
      if (res && res.length > 0) colVisible = true;
      let col = {
        name: objKeys[key],
        header: caption,
        width: 120,
        maxWidth: 120,
        filterType: 'None',
        columnWidth: '2',
        visible: colVisible,
        //dataType:'Number',
        aggregate: 'Sum',
        isReadOnly: true,
      };
      let isFound = scheme.columns.find((e) => e.name === col.name);
      if (!isFound) scheme.columns.push(col);
    }
  },
  getUsersInvitationsStatusList() {
    return [
      { id: 1, name: $.strings.usersInvitations.new },
      { id: 2, name: $.strings.usersInvitations.accepted },
      { id: 3, name: $.strings.usersInvitations.canceled },
    ];
  },
  getUsersInvitationsNameById(statusId) {
    switch (statusId) {
      case 1:
        return $.strings.usersInvitations.new;
      case 2:
        return $.strings.usersInvitations.accepted;
      case 3:
        return $.strings.usersInvitations.canceled;
    }
    return statusId + '';
  },
  getUserTypeName(typeId) {
    switch (typeId) {
      case 1:
        return $.strings.users.normalUser;
      case 2:
        return $.strings.users.superAdminUser;
      case 3:
        return $.strings.users.adminUser;
    }
    return typeId + '';
  },
  messagesContentTypeEnum: {
    sms: 1,
    whatsApp: 2,
    email: 3,
  },


  downloadPrintedAttachment(print_attachment, attachment_name) {
    let blob = this.base64toBlobPDF(print_attachment, 'application/pdf');
    let linkSource = URL.createObjectURL(blob);
    //window.open(linkSource, '_blank');

    const downloadLink = document.createElement('a');
    document.body.appendChild(downloadLink);
    downloadLink.href = linkSource;
    downloadLink.target = '_blank';
    downloadLink.download = attachment_name;
    downloadLink.click();
  },

  appendTaxExemptionsToGrid(scheme, data) {
    let objKeys = Object.keys(data[0]);
    for (let key = 0; key < objKeys.length; key++) {
      if (!objKeys[key].includes('=')) continue;
      if (!objKeys[key].startsWith('Exemption_')) continue;
      let caption = objKeys[key].replaceAll('=', ' ');
      caption = caption.replace('Exemption_', '');
      let colVisible = false;
      let res = data.filter((e) => e[objKeys[key]] !== null && (e[objKeys[key]] + '').trim() !== '');
      if (res && res.length > 0) colVisible = true;
      let col = {
        name: objKeys[key],
        header: caption,
        width: 150,
        maxWidth: 150,
        filterType: 'None',
        columnWidth: '2',
        visible: colVisible,
        isReadOnly: true,
      };
      let isFound = scheme.columns.find((e) => e.name === col.name);
      if (!isFound) scheme.columns.push(col);
    }
  },
  getAggregate(aggregate) {
    if (!aggregate) return 'None';
    if (isNaN(aggregate)) return aggregate;
    else {
      switch (aggregate) {
        case 0:
          return 'None';
        case 1:
          return 'Sum';
        case 2:
          return 'Cnt';
        case 3:
          return 'Avg';
        case 4:
          return 'Max';
        case 5:
          return 'Min';
        case 6:
          return 'Rng';
        case 7:
          return 'Std';
        case 8:
          return 'Var';
        case 9:
          return 'StdPop';
        case 10:
          return 'VarPop';
        case 11:
          return 'CntAll';
        case 12:
          return 'First';
        case 13:
          return 'Last';
        default:
          return 'None';
      }
    }
  },
  base64toBlobPDF(base64Data, contentType) {
    contentType = contentType || '';
    let sliceSize = 1024;
    let byteCharacters = atob(base64Data);
    let byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      let slice = byteCharacters.slice(offset, offset + sliceSize);
      let byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      let byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: contentType });
  },
  getSystemDate() {
    return $.systemDate || new Date();
  },
  ViewListOfVouchers(vouchersIdsList, voucherType) {
    if (!vouchersIdsList || vouchersIdsList.length <= 0) return;
    switch (voucherType) {
      case this.voucherTypeEnum.salesInvoice:
        this.goToNewTab('Delivery/SalesInvoice/', vouchersIdsList);
        break;
      case this.voucherTypeEnum.deliverySell:
        this.goToNewTab('Delivery/DeliverySell/', vouchersIdsList);
        break;
      case this.voucherTypeEnum.deliveryConsignmentSale:
        this.goToNewTab('Delivery/DeliveryConsignmentSale/', vouchersIdsList);
        break;
      case this.voucherTypeEnum.returnSell:
        this.goToNewTab('Delivery/returnSell/', vouchersIdsList);
        break;
      case this.voucherTypeEnum.purchaseInvoice:
        this.goToNewTab('Delivery/PurchaseInvoice/', vouchersIdsList);
        break;
      case this.voucherTypeEnum.deliveryPay:
        this.goToNewTab('Delivery/DeliveryPay/', vouchersIdsList);
        break;
      case this.voucherTypeEnum.returnPurchase:
        this.goToNewTab('Delivery/returnPurchase/', vouchersIdsList);
        break;
      case this.voucherTypeEnum.stockIn:
        this.goToNewTab('Vouchers/StockInVoucher/', vouchersIdsList);
        break;
      case this.voucherTypeEnum.stockOut:
        this.goToNewTab('Vouchers/StockOutVoucher/', vouchersIdsList);
        break;
      case this.voucherTypeEnum.useVoucher:
        this.goToNewTab('Vouchers/UseVoucher/', vouchersIdsList);
        break;
      case this.voucherTypeEnum.internalDelivery:
        this.goToNewTab('Vouchers/InternalDelivery/', vouchersIdsList);
        break;
      case this.voucherTypeEnum.credit:
        this.goToNewTab('Vouchers/CreditNote/', vouchersIdsList);
        break;
      case this.voucherTypeEnum.debit:
        this.goToNewTab('Vouchers/DebitNote/', vouchersIdsList);
        break;
      case this.voucherTypeEnum.qabd:
        this.goToNewTab('Vouchers/QabdVoucher/', vouchersIdsList);
        break;
      case this.voucherTypeEnum.sarf:
        this.goToNewTab('Vouchers/SarfVoucher/', vouchersIdsList);
        break;
      case this.voucherTypeEnum.journal:
        this.goToNewTab('Vouchers/JournalVoucher/', vouchersIdsList);
        break;
      case this.voucherTypeEnum.offerPrice:
        this.goToNewTab('Offers/OfferPrice/', vouchersIdsList);
        break;
      case this.voucherTypeEnum.sellOrder:
        this.goToNewTab('Orders/SellOrders/', vouchersIdsList);
        break;
      case this.voucherTypeEnum.purchaseOrder:
        this.goToNewTab('Orders/PayOrders/', vouchersIdsList);
        break;
      default:
        break;
    }
  },
  SettingsType_ForReset: {
    None: 0,
    GeneralSettings: 1,
    UsersSettings: 2,
    VouchersSettings: 3,
  },

  checkWhatsApp(number) {
    const whatsappRegex = /^(?:\+|00)[1-9]\d{1,14}$/;
    return whatsappRegex.test(number);
  },
  checkPhone(number, isPhone = false) {
    if (isPhone) {
      const nineDigitRegex = /^0\d{8}$/; // 9 digits starting with 0 (e.g., 092373001)
      const thirteenDigitRegexPlus = /^(00|\+)\d{12}$/; // 13 digits starting with 00 or + (e.g., 0097292373001 or +97292373001)
      const thirteenDigitRegex = /^00\d{11}$/;
      const twelveDigitRegex = /^\+\d{11}$/; // 12 digits starting with + (e.g., +97292373001)
      const elevenDigitRegex = /^\d{11}$/;
      return (
        nineDigitRegex.test(number) ||
        thirteenDigitRegexPlus.test(number) ||
        thirteenDigitRegex.test(number) ||
        twelveDigitRegex.test(number) ||
        elevenDigitRegex.test(number)
      );
    } else {
      const tenDigitRegex = /^\d{10}$/;
      const fourteenDigitRegex = /^(00|\+)\d{12}$/;
      const twelveDigitRegexPlus = /^\+\d{12}$/;
      const twelveDigitRegex = /^\d{12}$/;
      return tenDigitRegex.test(number) || fourteenDigitRegex.test(number) || twelveDigitRegexPlus.test(number) || twelveDigitRegex.test(number);
    }
  },
  getDateAsInt(dt) {
    let x = dt.getDate();
    x += (dt.getMonth() + 1) * 100;
    x += dt.getFullYear() * 10000;
    return x;
  },

  async onViewCustomer(cust_id, cust_type) {
    console.log(cust_id, cust_type)
    switch (
    cust_type + '' // نوع العميل من جدول object_type_captions_tbl وليس من جدول accounts_types_captions_tbl
    ) {
      case '0': {
        // عميل
        this.goToNewTab('Files/ChartOfAccount/' + cust_id);
        break;
      }
      case '1': {
        // مندوب
        this.goToNewTab('Files/AddSalesMan/' + cust_id);
        break;
      }
      case '2': {
        // عميل
        this.goToNewTab('Files/Customers/' + cust_id);
        break;
      }
      case '3': {
        // مورد
        this.goToNewTab('Files/Suppliers/' + cust_id);
        break;
      }
      case '4': {
        // مشتركين
        this.goToNewTab('Files/Subscribers/' + cust_id);
        break;
      }
      case '5': {
        // اخرين
        this.goToNewTab('Files/Others/' + cust_id);
        break;
      }
      case '6': {
        // اخرين
        this.goToNewTab('Files/AddEmployee/' + cust_id);
        break;
      }
      case '7': {
        // عميل اعتمادات
        this.goToNewTab('Files/CustomersCredits/' + cust_id);
        break;
      }
      default: {
        break;
      }
    }
  },

  managementSettingsEnum: {
    transactionsCount: 1,
    accountsCount: 5,
    customersCount: 6,
    itemsCount: 7,
    employeesCount: 8,
    usersCount: 9,
  },
  checkDemoQueryVersions(managementSettings) {
    if (!$.companyInfo) return false;
    else if ($.companyInfo && $.companyInfo.statusId === 3) return false;
    else if ($.companyInfo && $.companyInfo.isTrial) {
      const obj = $.companyInfo.settings.find((e) => e.id === managementSettings);
      switch (managementSettings) {
        case this.managementSettingsEnum.transactionsCount: {
          if ($.companyInfo.current_transactions_count >= obj.value) {
            alert($.strings.current_transactions_count + ' ' + obj.value);
            return false;
          } else return true;
        }
        case this.managementSettingsEnum.accountsCount: {
          if ($.companyInfo.current_accounts_count >= obj.value) {
            alert($.strings.current_accounts_count + ' ' + obj.value);
            return false;
          } else return true;
        }
        case this.managementSettingsEnum.customersCount: {
          if ($.companyInfo.current_customers_count >= obj.value) {
            alert($.strings.current_customers_count + ' ' + obj.value);
            return false;
          } else return true;
        }
        case this.managementSettingsEnum.itemsCount: {
          if ($.companyInfo.current_items_count >= obj.value) {
            alert($.strings.current_items_count + ' ' + obj.value);
            return false;
          } else return true;
        }
        case this.managementSettingsEnum.employeesCount: {
          if ($.companyInfo.current_employees_count >= obj.value) {
            alert($.strings.current_employees_count + ' ' + obj.value);
            return false;
          } else return true;
        }
      }
    } else {
      if (managementSettings === this.managementSettingsEnum.usersCount) {
        if ($.companyInfo.current_active_users_count >= $.companyInfo.userscount) return false;
      }
    }

    return true;
  },


  convertToValidInteger(v) {
    return v ? parseInt(v) : 0;
  },
  convertToValidDouble(v) {
    return v ? parseFloat(v) : 0;
  },
  formatNumber(value, decimals) {
    let v = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
    /*if(e.cell.textContent==='-0.0')e.cell.textContent='0.0';
    if(e.cell.textContent==='-0.00')e.cell.textContent='0.00';
    if(e.cell.textContent==='-0.000')e.cell.textContent='0.00';*/
    const txt = v;
    const match = /^-0\.(0+)$/.exec(txt);
    if (match) {
      const len = match[1].length;
      // If 1 or 2 zeros, keep the same length; if more, drop one zero
      const newLen = len > 2 ? len - 1 : len;
      v = '0.' + '0'.repeat(newLen);
    }
    return v;
  },
  placeHolderForDecimalValue() {
    let formate = '0.0';
    let fractionValue = this.getSystemSetting(17);
    let decimalLength = parseFloat(fractionValue);
    for (let i = 1; i < decimalLength; i++) {
      formate += '0';
    }
    return formate;
  },
  parseToNumber(value) {
    const number = Number(value); // Try to convert to number
    return isNaN(number) ? 0 : number; // Return 0 if conversion fails
  },
  compareDates(_dt, filterTxt) {
    let rst = true;
    /*const dateLocales = [
      'en-US', // MM/DD/YYYY
      'en-GB', // DD/MM/YYYY
      'de-DE', // DD.MM.YYYY
      'fr-FR', // DD/MM/YYYY
      'es-ES', // DD/MM/YYYY
      'it-IT', // DD/MM/YYYY
      'ja-JP', // YYYY/MM/DD
      'zh-CN', // YYYY/M/D
      'ru-RU', // DD.MM.YYYY
      'ar-SA', // Islamic calendar (varies)
      'hi-IN', // DD/MM/YYYY
      'ko-KR', // YYYY. MM. DD.
      'pt-BR', // DD/MM/YYYY
      'nl-NL', // DD-MM-YYYY
      'sv-SE', // YYYY-MM-DD
      'fi-FI', // DD.MM.YYYY
      'da-DK', // DD/MM/YYYY
      'nb-NO', // DD.MM.YYYY
      'tr-TR', // DD.MM.YYYY
      'pl-PL', // DD.MM.YYYY
    ];*/

    /*dateLocales.forEach((locale) => */
    let locale = 'sv-SE';
    {
      let dt = new Date(_dt).toLocaleDateString(locale);
      let dtFilterTxt = new Date(filterTxt).toLocaleDateString(locale);
      let filterTxtSlash = filterTxt.replaceAll('-', '/');
      let filterTxtDash = filterTxt.replaceAll('/', '-');

      let filterTxtSlashFlepped = filterTxtSlash.split('/').reverse().join('/');
      let filterTxtDashFlepped = filterTxtDash.split('-').reverse().join('-');

      const _rst =
        filterTxt.length === 0 ||
        _dt.toString().toLowerCase().indexOf(filterTxtSlash.toLowerCase()) > -1 ||
        _dt.toString().toLowerCase().indexOf(filterTxtDash.toLowerCase()) > -1 ||
        dt.toString().toLowerCase().indexOf(filterTxtSlash.toLowerCase()) > -1 ||
        dt.toString().toLowerCase().indexOf(filterTxtDash.toLowerCase()) > -1 ||
        dt.toString().toLowerCase().indexOf(filterTxtSlashFlepped.toLowerCase()) > -1 ||
        dt.toString().toLowerCase().indexOf(filterTxtDashFlepped.toLowerCase()) > -1 ||
        (dt === dtFilterTxt && dtFilterTxt !== 'Invalid Date');
      if (!_rst) rst = false;
    }//);
    if (rst) return rst;
    let locale2 = 'en-GB';
    {
      let dt = new Date(_dt).toLocaleDateString(locale2);
      let dtFilterTxt = new Date(filterTxt).toLocaleDateString(locale2);
      let filterTxtSlash = filterTxt.replaceAll('-', '/');
      let filterTxtDash = filterTxt.replaceAll('/', '-');

      const _rst =
        filterTxt.length === 0 ||
        _dt.toString().toLowerCase().indexOf(filterTxtSlash.toLowerCase()) > -1 ||
        _dt.toString().toLowerCase().indexOf(filterTxtDash.toLowerCase()) > -1 ||
        dt.toString().toLowerCase().indexOf(filterTxtSlash.toLowerCase()) > -1 ||
        dt.toString().toLowerCase().indexOf(filterTxtDash.toLowerCase()) > -1 ||
        (dt === dtFilterTxt && dtFilterTxt !== 'Invalid Date');
      if (!_rst) rst = false;
    }//);
    if (rst) return rst;

    let shortDate = new Date(_dt).toLocaleDateString('en-GB');
    const [day, month, year] = shortDate.split('/');
    for (let x = 0; x < 2; x++) {
      let seprator = x === 0 ? '/' : '-';
      if (!rst) {
        const [dayFltr, monthFltr, yearFltr] = filterTxt.split('T')[0].split(seprator);
        if (+dayFltr === +day && +monthFltr === +month && +yearFltr === +year) {
          rst = true;
          break;
        }
      }
      if (!rst) {
        const [monthFltr, dayFltr, yearFltr] = filterTxt.split('T')[0].split(seprator);
        if (+dayFltr === +day && +monthFltr === +month && +yearFltr === +year) {
          rst = true;
          break;
        }
      }
    }

    //if(!rst && this.compareInsertDates(filterTxt,_dt)) rst = true
    return rst;
  },
  compareInsertDates(dateStr1, dateStr2) {
    const date1 = new Date(dateStr1);
    const date2 = new Date(dateStr2);

    console.log("date1 ", date1.getTime(), " date2 ", date2.getTime())
    return (date1.getTime() === date2.getTime());                       // equal
  },

  specialAdjustCode(transactionType, suffix, vchBook) {
    let result = '';
    const maxLength = this.getSystemSetting(114);

    let transactionTypeCode = '';
    transactionTypeCode = transactionType.code_prefix;
    let vchBookVal = '';
    if (vchBook && vchBook.book) vchBookVal = vchBook.book;

    result = transactionTypeCode + vchBookVal + suffix;
    let tempCode = this.adjustCode(result, maxLength);
    if (tempCode.length > maxLength) {
      //remove zeros from middle
      if (suffix[0] === '0') tempCode = tempCode.replace(/(?!^)0+/, '');
      tempCode = this.adjustCode(tempCode, maxLength);
      if (suffix[0] === 'Z') tempCode = tempCode.replace(/(?!^)Z+/, '');
      tempCode = this.adjustCodeZ(tempCode, maxLength);
    }
    result = tempCode;
    return result;
  },
  checkIsMainLang() {
    if ($.settings.Common.mainLanguage === localStorage.getItem('lang_id') + '') {
      return true;
    } else return false;
  },
  getQrBarCode(qRBarCodeInfo, obj) {
    if (!qRBarCodeInfo) qRBarCodeInfo = '';
    // qRBarCodeInfo ='اسم المؤسسة: شركة اسراء,رقم الفاتورة: فاتورة مبيعات ضريبية رقم (I00000052),اسم العميل: السادة: zead/000000002';
    // اسم المؤسسة [company_name]
    qRBarCodeInfo = qRBarCodeInfo.replace('[company_name]', obj.company_name);
    // رقم الفاتورة [invoice_code]
    qRBarCodeInfo = qRBarCodeInfo.replace('[invoice_code]', obj.invoice_code);
    // اسم العميل ورقمه [customer_name]
    qRBarCodeInfo = qRBarCodeInfo.replace('[customer_name]', obj.customer_name);
    // رقم المشتغل المرخص للعميل [vatreg]
    qRBarCodeInfo = qRBarCodeInfo.replace('[vatreg]', obj.vatreg);
    // تاريخ ووقت الفاتورة [invoice_datetime]
    qRBarCodeInfo = qRBarCodeInfo.replace('[invoice_datetime]', obj.invoice_datetime);
    // مجموع مبالغ الاصناف [items_amount_total]
    qRBarCodeInfo = qRBarCodeInfo.replace('[items_amount_total]', obj.items_amount_total);
    // مجموع الخصومات [discount_total]
    qRBarCodeInfo = qRBarCodeInfo.replace('[discount_total]', obj.discount_total);
    // مبلغ الضريبة [vat_amount]
    qRBarCodeInfo = qRBarCodeInfo.replace('[vat_amount]', obj.vat_amount);
    // الصافي للدفع (ش.ض) [net]
    qRBarCodeInfo = qRBarCodeInfo.replace('[net]', obj.net);

    // qRBarCodeInfo ="اسم الشركة:"+obj.company_name+"";
    //qRBarCodeInfo += "\n ";
    // qRBarCodeInfo +="johar50000000000055555555555555555555555555555555555555";
    //qRBarCodeInfo +="رقم الفاتورة:"+obj.invoice_code;
    //qRBarCodeInfo +=" رقم العميل:"+obj.customer_name;
    return qRBarCodeInfo;
  },
  connectedVatEnum: {
    none: 1,
    palestian: 2,
    jordan: 3,
  },
  itemPriceFromEnum: {
    fromUnitPrice: 1,
    fromToMainUnitQnty: 2,
  },
};
export default exportDefault;
