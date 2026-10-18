import { describe, expect, it } from 'vitest';
import { AppError, getErrorMessage } from '../../src/shared/errors';

describe('getErrorMessage', () => {
  it.each([
    [{ code: 'DB_ERROR', userMessage: '请等待扫描完成。', message: 'technical error' }, '请等待扫描完成。'],
    [new AppError('DB_ERROR', 'technical error', '请重试。'), '请重试。'],
    [new Error('请求超时。'), '请求超时。'],
    [{ message: '请求超时。' }, '请求超时。'],
    ['请求失败。', '请求失败。'],
    [{ userMessage: '', message: '可用提示。' }, '可用提示。'],
    [{ userMessage: 42 }, '操作失败。'],
    [{}, '操作失败。'],
    [{ userMessage: "Error invoking remote method 'library:refresh-game-metadata': Error: 正在切换并扫描音乐库，请稍候。" }, '正在切换并扫描音乐库，请稍候。'],
    [null, '操作失败。'],
  ])('reads meaningful text from %j', (error, expected) => {
    expect(getErrorMessage(error, '操作失败。')).toBe(expected);
  });
});
