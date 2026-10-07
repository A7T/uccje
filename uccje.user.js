// ==UserScript==
// @name         ChatGPT Conversation JSON Exporter
// @name:zh-CN   ChatGPT 对话 JSON 导出工具
// @namespace    https://github.com/A7T/uccje
// @version      0.2.0
// @description  Download the current ChatGPT conversation as raw JSON.
// @description:zh-CN 下载当前 ChatGPT 对话的原始 JSON。
// @author       A7T
// @license      MIT
// @updateURL    https://a7t.ink/uccje/uccje.meta.js
// @downloadURL  https://a7t.ink/uccje/uccje.user.js
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const BUTTON_ID = 'uccje-download-button';
  const HEADER_SELECTOR = '[data-app-shell-main-titlebar="true"]';
  const CONVERSATION_ID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function getConversationId() {
    const segments = window.location.pathname.split('/').filter(Boolean);
    for (let index = 0; index < segments.length - 1; index += 1) {
      if (segments[index] === 'c' && CONVERSATION_ID_PATTERN.test(segments[index + 1])) {
        return segments[index + 1];
      }
    }
    return null;
  }

  async function getAccessToken() {
    const response = await fetch('/api/auth/session', {
      credentials: 'include',
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`无法读取 ChatGPT 登录会话（HTTP ${response.status}）。`);
    }

    const session = await response.json();
    if (!session || typeof session.accessToken !== 'string' || !session.accessToken) {
      throw new Error('ChatGPT 登录会话中没有可用的 access token。');
    }

    return session.accessToken;
  }

  async function getRawConversation(conversationId) {
    const accessToken = await getAccessToken();
    const response = await fetch(
      `/backend-api/conversation/${encodeURIComponent(conversationId)}`,
      {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'X-Authorization': `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('ChatGPT 拒绝了请求，请刷新页面或重新登录后再试。');
      }
      if (response.status === 404) {
        throw new Error('没有找到当前对话，它可能仍在创建或已经被删除。');
      }
      throw new Error(`下载对话失败（HTTP ${response.status}）。`);
    }

    const rawText = await response.text();
    let conversation;
    try {
      conversation = JSON.parse(rawText);
    } catch {
      throw new Error('ChatGPT 返回的内容不是有效 JSON。');
    }

    if (!conversation || typeof conversation !== 'object') {
      throw new Error('ChatGPT 返回的对话 JSON 格式无效。');
    }

    const responseConversationId = conversation.conversation_id || conversation.id;
    if (responseConversationId !== conversationId) {
      throw new Error('ChatGPT 返回了另一个对话，已取消下载。');
    }

    return { rawText, conversation };
  }

  function getCurrentBranchLatestTime(conversation) {
    const mapping = conversation.mapping;
    if (mapping && typeof mapping === 'object') {
      const visited = new Set();
      let nodeId = conversation.current_node;

      while (typeof nodeId === 'string' && nodeId && !visited.has(nodeId)) {
        visited.add(nodeId);
        const node = mapping[nodeId];
        if (!node || typeof node !== 'object') {
          break;
        }

        const createTime = node.message && node.message.create_time;
        if (typeof createTime === 'number' && Number.isFinite(createTime)) {
          return createTime;
        }

        nodeId = node.parent;
      }
    }

    if (typeof conversation.update_time === 'number' && Number.isFinite(conversation.update_time)) {
      return conversation.update_time;
    }

    return Date.now() / 1000;
  }

  function formatLocalMinute(timestamp) {
    const milliseconds = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
    const date = new Date(milliseconds);
    if (Number.isNaN(date.getTime())) {
      return formatLocalMinute(Date.now());
    }

    const pad = (value) => String(value).padStart(2, '0');
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      pad(date.getHours()),
      pad(date.getMinutes()),
    ].join('');
  }

  function downloadText(text, filename) {
    const url = URL.createObjectURL(
      new Blob([text], { type: 'application/json;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  function setButtonState(button, label, disabled) {
    button.setAttribute('aria-label', label);
    button.title = label;
    button.disabled = disabled;
  }

  async function handleDownload(button) {
    const conversationId = getConversationId();
    if (!conversationId) {
      return;
    }

    setButtonState(button, '下载中…', true);
    try {
      const { rawText, conversation } = await getRawConversation(conversationId);
      const timestamp = formatLocalMinute(getCurrentBranchLatestTime(conversation));
      downloadText(rawText, `${conversationId}-${timestamp}.json`);
      setButtonState(button, '已下载', true);
      window.setTimeout(() => setButtonState(button, '下载聊天', false), 1_200);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[uccje] 下载失败：', message);
      setButtonState(button, '下载失败', true);
      window.alert(`uccje：${message}`);
      window.setTimeout(() => setButtonState(button, '下载聊天', false), 1_500);
    }
  }

  function createButton(shareButton) {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = shareButton.className;
    // The share control now includes text; keep our icon-only control square.
    button.style.cssText = 'aspect-ratio:1;padding:0;flex-shrink:0;justify-content:center;';
    button.setAttribute('aria-label', '下载聊天');
    button.title = '下载聊天';
    button.innerHTML = `
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 3v12"></path>
        <path d="m8 11 4 4 4-4"></path>
        <path d="M5 21h14"></path>
      </svg>
    `;
    button.addEventListener('click', () => handleDownload(button));
    return button;
  }

  function findShareButton() {
    // Replies also have share buttons. Only inspect the current titlebar, and
    // use the icon name so this does not depend on the interface language.
    for (const button of document.querySelectorAll(`${HEADER_SELECTOR} button`)) {
      if (button.closest('[hidden], [aria-hidden="true"]') || !button.getClientRects().length) {
        continue;
      }
      const icon = button.querySelector('svg use')?.getAttribute('href')?.split('#')[1];
      if (icon?.startsWith('arrow-up-open-base-')) {
        return button;
      }
    }
    return null;
  }

  // Reuse the same control when React replaces the titlebar, including while
  // a download is pending. Its disabled state and click handler stay intact.
  let button;

  function syncButton() {
    const shareButton = getConversationId() && findShareButton();
    if (!shareButton) {
      button?.remove();
      return;
    }

    button ??= createButton(shareButton);
    if (button.className !== shareButton.className) {
      button.className = shareButton.className;
    }
    if (shareButton.nextElementSibling !== button) {
      shareButton.insertAdjacentElement('afterend', button);
    }
  }

  let syncScheduled = false;
  function scheduleSync() {
    if (syncScheduled) {
      return;
    }
    syncScheduled = true;
    window.requestAnimationFrame(() => {
      syncScheduled = false;
      syncButton();
    });
  }

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-hidden', 'hidden', 'href', 'data-app-shell-main-titlebar'],
  });
  window.addEventListener('popstate', scheduleSync);
  window.addEventListener('pageshow', scheduleSync);
  scheduleSync();
})();
