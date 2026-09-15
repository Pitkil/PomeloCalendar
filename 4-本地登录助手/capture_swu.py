#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""西南大学课表本地抓取助手。

程序只打开一个临时 Chrome 会话。用户自行完成统一认证、滑块和课表页面导航，
按回车后由浏览器读取当前课表 DOM，并把结构化 JSON 写到网页版目录。账号、
密码和 Cookie 不会写入磁盘，也不会发送到本项目的云端后端。
"""

from __future__ import annotations

import json
import sys
import time
import webbrowser
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("未安装 Playwright。请先运行：python -m pip install playwright")
    print("如提示缺少浏览器，再运行：python -m playwright install chromium")
    raise SystemExit(1)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "2-网页版源码" / "captured-swu.json"
START_URL = "https://jw.swu.edu.cn/sso/zllogin"


EXTRACT_SCRIPT = r"""
() => {
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const field = (el, labels) => {
    for (const node of el.querySelectorAll('[title]')) {
      const title = clean(node.getAttribute('title'));
      if (!labels.some((label) => title.includes(label))) continue;
      const line = node.closest('p') || node.parentElement;
      const text = clean(line ? line.textContent : '');
      const labelText = clean(node.textContent);
      if (labelText && text.startsWith(labelText)) return clean(text.slice(labelText.length));
      if (text) return text;
    }
    return '';
  };
  const parsePeriod = (text) => {
    const match = clean(text).match(/(\d+)\s*(?:-|至)\s*(\d+)\s*节|第?\s*(\d+)\s*节/);
    if (!match) return '';
    return match[1] ? `${match[1]}-${match[2]}节` : `${match[3]}节`;
  };
  const parseWeeks = (text) => {
    const value = clean(text).replace(/^.*?节\s*[）)]?/, '').trim();
    return value || '1-19周';
  };
  const titleOf = (el) => clean(el.querySelector('.title, a, font')?.textContent) || clean(el.textContent).split(/[\n\r]/)[0];
  const courses = [];
  document.querySelectorAll('.timetable_con').forEach((el, index) => {
    const td = el.closest('td');
    const id = td?.id || '';
    const grid = id.match(/^(\d+)-(\d+)$/);
    const legacy = id.match(/^jc_(\d+)-(\d+)-(\d+)/);
    const weekday = Number(grid?.[1] || legacy?.[1] || 0);
    const fallbackStart = Number(grid?.[2] || legacy?.[2] || 0);
    if (!weekday) return;
    const detailText = field(el, ['节/周', '节次']) || clean(el.textContent);
    const sessions = parsePeriod(detailText) || `${fallbackStart || 1}节`;
    const title = titleOf(el).replace(/[◇◆△▲★☆*※]+/g, '').trim();
    if (!title) return;
    courses.push({
      id: `manual-${index + 1}`,
      title,
      teacher: field(el, ['教师', '任课教师']),
      place: field(el, ['上课地点', '地点']),
      weekday,
      sessions,
      weeks: parseWeeks(detailText)
    });
  });
  return courses;
}
"""


def extract_from_page(page):
    best = []
    for frame in page.frames:
        try:
            result = frame.evaluate(EXTRACT_SCRIPT)
        except Exception:
            continue
        if isinstance(result, list) and len(result) > len(best):
            best = result
    return best


def main():
    print("=" * 56)
    print("   西柚日历 · 西南大学课表本地登录助手")
    print("=" * 56)
    print("1. Chrome 会话只在本次运行中使用，不保存密码或 Cookie。")
    print("2. 请在弹出的浏览器中完成登录、滑块验证，并进入‘我的课表’页面。")
    print("3. 确认课表完整显示后，回到这里按回车开始抓取。\n")

    with sync_playwright() as playwright:
        browser = None
        for kwargs in ({"channel": "chrome"}, {}):
            try:
                browser = playwright.chromium.launch(headless=False, args=["--start-maximized"], **kwargs)
                break
            except Exception:
                continue
        if browser is None:
            print("无法启动 Chrome/Chromium，请检查浏览器安装。")
            return 1
        context = browser.new_context(no_viewport=True)
        page = context.new_page()
        try:
            page.goto(START_URL, wait_until="domcontentloaded", timeout=60_000)
        except Exception:
            print("起始页加载较慢，请在浏览器地址栏手动打开：", START_URL)
        input("看到完整课表后按回车抓取 … ")
        courses = extract_from_page(page)
        if not courses:
            print("没有识别到课程。请确认停留在课表网格页面后重试。")
            browser.close()
            return 1
        payload = {"source": "local-browser", "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "courses": courses}
        OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"已抓取 {len(courses)} 门课程：{OUTPUT}")
        print("回到西柚日历 → 同步课表 → 手动登录后导入，选择这个 JSON 文件即可。")
        webbrowser.open((ROOT / "2-网页版源码" / "index.html").as_uri())
        input("按回车关闭登录浏览器 … ")
        browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
