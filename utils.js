/* utils.js
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

const URL_REGEXP =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/

export function getUrl(text) {
  if (!text) {
    return null
  }

  return URL_REGEXP.test(text) ? text : null
}
