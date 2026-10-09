import { Alert, Platform, type AlertButton } from 'react-native';

import { Colors, Radius } from '@/design-system/tokens';

// React Native WebのAlert.alertは何もしない(メニューや確認ダイアログが出ない)。
// Webだけ、Alert.alertをDOMのモーダルへ差し替える。呼び出し側は変更しない。
// ボタンの意味はネイティブと同じ: cancelは背景タップ・Escでも選ばれ、
// destructiveは警告色で出す。

let installed = false;
const openOverlays: HTMLElement[] = [];

function style(element: HTMLElement, css: Partial<CSSStyleDeclaration>) {
  Object.assign(element.style, css);
}

function showWebAlert(title: string, message?: string, buttons?: AlertButton[]) {
  const actions: AlertButton[] = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
  const cancel = actions.find((button) => button.style === 'cancel');

  const previousFocus = document.activeElement as HTMLElement | null;
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);
  style(overlay, {
    position: 'fixed',
    inset: '0',
    zIndex: '10000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    backgroundColor: 'rgba(38, 51, 45, 0.45)',
  });

  const panel = document.createElement('div');
  style(panel, {
    width: '100%',
    maxWidth: '360px',
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: '20px',
    boxSizing: 'border-box',
    borderRadius: `${Radius.card}px`,
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
    fontFamily: 'inherit',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  });

  const heading = document.createElement('div');
  heading.textContent = title;
  style(heading, { fontSize: '17px', fontWeight: '700', lineHeight: '1.4' });
  panel.appendChild(heading);

  if (message) {
    const body = document.createElement('div');
    body.textContent = message;
    style(body, { fontSize: '14px', lineHeight: '1.5', color: Colors.textSecondary });
    panel.appendChild(body);
  }

  const close = () => {
    document.removeEventListener('keydown', onKeyDown, true);
    openOverlays.splice(openOverlays.indexOf(overlay), 1);
    overlay.remove();
    previousFocus?.focus?.();
  };
  const choose = (button?: AlertButton) => {
    close();
    button?.onPress?.();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    // ダイアログが重なっているときは、最前面のものだけがEscapeに反応する。
    if (event.key === 'Escape' && openOverlays[openOverlays.length - 1] === overlay) {
      event.stopPropagation();
      choose(cancel);
    }
  };

  const buttonList = document.createElement('div');
  style(buttonList, { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' });
  let firstButton: HTMLButtonElement | null = null;
  for (const button of actions) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = button.text ?? '';
    const destructive = button.style === 'destructive';
    const isCancel = button.style === 'cancel';
    style(element, {
      minHeight: '48px',
      padding: '0 16px',
      borderRadius: `${Radius.input}px`,
      border: `1px solid ${destructive ? Colors.danger : Colors.border}`,
      backgroundColor: destructive ? Colors.dangerSoft : isCancel ? Colors.surface : Colors.primarySoft,
      color: destructive ? Colors.danger : isCancel ? Colors.textSecondary : Colors.primaryStrong,
      fontSize: '15px',
      fontWeight: '600',
      fontFamily: 'inherit',
      cursor: 'pointer',
    });
    element.addEventListener('click', () => choose(button));
    buttonList.appendChild(element);
    firstButton ??= element;
  }
  panel.appendChild(buttonList);
  overlay.appendChild(panel);

  // 背景タップはキャンセル扱い(cancelボタンが無いダイアログでは閉じない)。
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay && cancel) {
      choose(cancel);
    }
  });

  document.addEventListener('keydown', onKeyDown, true);
  document.body.appendChild(overlay);
  openOverlays.push(overlay);
  firstButton?.focus();
}

export function installWebAlert() {
  if (Platform.OS !== 'web' || installed || typeof document === 'undefined') {
    return;
  }
  installed = true;
  Alert.alert = showWebAlert;
}
