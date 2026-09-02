// md-lite（说明书渲染）：转义先行 + 三种块 + 三种行内。created 2026-09-02 by Claude Fable 5.1.
import { describe, it, eq } from "./runner.mjs";
import { renderMdLite } from "../src/ui/md-lite.ts";

describe("md-lite", () => {
  it("段落 + 粗体 + code", () => {
    eq(renderMdLite("hello **world** `x`"), "<p>hello <strong>world</strong> <code>x</code></p>");
  });
  it("空行分段；段内换行 = <br>", () => {
    eq(renderMdLite("a\nb\n\nc"), "<p>a<br>b</p><p>c</p>");
  });
  it("列表块", () => {
    eq(renderMdLite("- one\n- **two**"), "<ul><li>one</li><li><strong>two</strong></li></ul>");
  });
  it("小标题", () => { eq(renderMdLite("## Title"), "<h4>Title</h4>"); });
  it("HTML 先转义（文案里的标签不会活）", () => {
    eq(renderMdLite("<b>x</b> & y"), "<p>&lt;b&gt;x&lt;/b&gt; &amp; y</p>");
  });
  it("链接只放行 http(s)，新页 + noopener", () => {
    eq(renderMdLite("[a](https://x.y/z)"), '<p><a href="https://x.y/z" target="_blank" rel="noopener noreferrer">a</a></p>');
    eq(renderMdLite("[a](javascript:alert(1))"), "<p>[a](javascript:alert(1))</p>");
  });
  it("CRLF 归一", () => { eq(renderMdLite("a\r\n\r\nb"), "<p>a</p><p>b</p>"); });
});
