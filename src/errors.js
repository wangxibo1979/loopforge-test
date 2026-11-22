/**
 * HTTP 错误类型：路由层抛出，由统一错误中间件转成响应。
 */
export class HttpError extends Error {
  /**
   * @param {number} status HTTP 状态码
   * @param {string} message 错误描述
   */
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}
