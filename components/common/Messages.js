import React from 'react';
import styles from './Messages.module.scss';
import { Messages as PrimeMessages } from 'primereact/messages';
import { Toast as PrimeToast } from 'primereact/toast';

//import { Growl as PrimeGrowl } from 'primereact/growl';

export default class Messages extends React.Component {
  render() {
    const { innerRef, isSaving, ...passThroughProps } = this.props;
    return (
      <PrimeMessages id="messages-feldArea" ref={innerRef} className={styles.messageBar} {...passThroughProps} transitionOptions={null} />
      //<PrimeGrowl ref={innerRef} className={styles.messageBar} {...passThroughProps} position="top-left"/>
    );
  }
}
