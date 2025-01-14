import browser, { WebRequest } from 'webextension-polyfill';

import { getBangsLookup } from './lookup';
import { getIgnoredDomains } from './ignoreddomains';

const possibleQueryParams = ['q', 'query', 'eingabe'];

/**
 * Should this URL be rejected provided the given blacklist?
 * @param blacklist The list of hostnames to reject.
 * @param url The URL to test against the blacklist.
 * @returns Whether or not the URLs hostname exists in the blacklist.
 */
export function shouldReject(blacklist: Readonly<string[]>, url: string): boolean {
  if (blacklist.includes(new URL(url).hostname)) {
    return true;
  }
  return false;
}

/**
 * Construct a URL to send the user to given the bang URL and query text.
 * @param redirectUrl A URL formatted with `%s` to insert the queryText into.
 * @param queryText The text to insert into the redirectUrl.
 * @returns The formatted URL.
 */
export function constructRedirect(redirectUrl: string, queryText: string): string {
  if (queryText === '') {
    return (new URL(redirectUrl)).origin;
  }
  return redirectUrl.replace(/%s/g, encodeURIComponent(queryText));
}

/**
 * Replace the first non ascii exclamation mark with the ascii exclamation mark.
 * @param queryText Text that might contain a non standard exclamation mark, e.g. `！g rust`
 * @returns The same text with an ascii exclamation mark instead, e.g. `!g rust`
 */
export function replaceFirstNonAsciiExclamationMark(queryText: string): string {
  const nonAsciiExclamationMarks = [
    '！', // Chinese exclamation mark
  ];
  for (const nonAsciiExclamationMark of nonAsciiExclamationMarks) {
    if (queryText.indexOf(nonAsciiExclamationMark) > -1) {
      return queryText.replace(nonAsciiExclamationMark, '!');
    }
  }
  return queryText;
}

/**
 * Given a URL, construct the associated redirects, if a bang exists in the query.
 * @param request The request details from a WebRequest event.
 * @returns A list of redirections to issue.
 */
export async function getRedirects(
  request: WebRequest.OnBeforeRequestDetailsType,
): Promise<string[]> {
  const url = new URL(request.url);
  let queryText = '';

  // Startpage and searx.be send POST request so extract the query from the formdata.
  // Else try to get the query parameter from the URL.

  if (request !== undefined && request.method === 'POST') {
    if (url.hostname.match(/^(.*\.)?startpage.com/gi)) {
      queryText = request.requestBody?.formData?.query?.[0] ?? '';
    } else if (url.hostname.match(/^(.*\/\/)?searx.be/gi)) {
      queryText = request.requestBody?.formData?.q?.[0] ?? '';
    }
  } else {
    for (const param of possibleQueryParams) {
      const queryFromParam = url.searchParams.get(param);
      if (queryFromParam !== null) {
        queryText = queryFromParam;
        break;
      }
    }
  }

  queryText = queryText.trim();

  if (queryText.length === 0) {
    return Promise.resolve([]);
  }

  // Fix exclamation mark if non ascii version found.
  queryText = replaceFirstNonAsciiExclamationMark(queryText);

  // Cut first bang from query text, it can be anywhere in the string.
  let bang = '';
  queryText = queryText.replace(/(^!\S+ | !\S+|^!\S+$)/, (match): string => {
    bang = match.trim().replace('!', '');
    // Replace bang with zero len str.
    return '';
  });

  if (bang.length === 0) {
    return Promise.resolve([]);
  }

  // Get the chosen URLs from the bang.
  const lookup = await getBangsLookup();
  const redirectionUrls = lookup[bang];
  if (redirectionUrls === undefined || redirectionUrls.length === 0) {
    return Promise.resolve([]);
  }

  // Construct the URL(s) to redirect the user to.
  const redirects = [];
  for (const redirectionUrl of redirectionUrls) {
    redirects.push(constructRedirect(redirectionUrl, queryText));
  }

  return Promise.resolve(redirects);
}

/**
 * Process a WebRequest event.
 * @param r The request details.
 * @returns An empty Promise.
 */
export async function processRequest(
  r: WebRequest.OnBeforeRequestDetailsType,
): Promise<void> {
  if (r.type !== 'main_frame') {
    return Promise.resolve();
  }

  if (shouldReject(await getIgnoredDomains(), r.url)) {
    return Promise.resolve();
  }

  // From the current URL, get the redirections (if any) to apply.
  const redirections = await getRedirects(r);

  if (redirections.length === 0) {
    return Promise.resolve();
  }

  // Open all URLs (except the first) in new tabs
  for (let i = 1; i < redirections.length; i += 1) {
    browser.tabs.create({ url: redirections[i] });
  }

  // Finally send the current tab to the first in the array.
  browser.tabs.update(r.tabId, { url: redirections[0] });

  return Promise.resolve();
}
