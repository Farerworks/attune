// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { isKeyboardOpen, isTextInputElement } from './keyboard';

describe('isKeyboardOpen', () => {
  it('keyboard closed — viewport matches window height', () => {
    expect(isKeyboardOpen(800, 800)).toBe(false);
  });

  it('keyboard open — viewport shrunk well past the threshold', () => {
    expect(isKeyboardOpen(460, 800)).toBe(true);
  });

  it('boundary: a gap just at the threshold (120) is not "open"', () => {
    expect(isKeyboardOpen(680, 800)).toBe(false);
  });

  it('boundary: a gap just past the threshold (121) is "open"', () => {
    expect(isKeyboardOpen(679, 800)).toBe(true);
  });

  it('small, non-keyboard gaps (e.g. browser chrome) stay closed', () => {
    expect(isKeyboardOpen(770, 800)).toBe(false);
  });
});

describe('isTextInputElement', () => {
  it('null -> false', () => {
    expect(isTextInputElement(null)).toBe(false);
  });

  it('input[type=text] -> true', () => {
    const el = document.createElement('input');
    el.type = 'text';
    expect(isTextInputElement(el)).toBe(true);
  });

  it('input with no explicit type (defaults to text) -> true', () => {
    const el = document.createElement('input');
    expect(isTextInputElement(el)).toBe(true);
  });

  it('textarea -> true', () => {
    expect(isTextInputElement(document.createElement('textarea'))).toBe(true);
  });

  it('contenteditable element -> true', () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    document.body.appendChild(el);
    expect(isTextInputElement(el)).toBe(true);
    el.remove();
  });

  it('button -> false', () => {
    expect(isTextInputElement(document.createElement('button'))).toBe(false);
  });

  it('input[type=checkbox] -> false', () => {
    const el = document.createElement('input');
    el.type = 'checkbox';
    expect(isTextInputElement(el)).toBe(false);
  });

  it('input[type=radio] and input[type=range] -> false', () => {
    const radio = document.createElement('input');
    radio.type = 'radio';
    const range = document.createElement('input');
    range.type = 'range';
    expect(isTextInputElement(radio)).toBe(false);
    expect(isTextInputElement(range)).toBe(false);
  });

  it('plain div (not contenteditable) -> false', () => {
    expect(isTextInputElement(document.createElement('div'))).toBe(false);
  });
});
