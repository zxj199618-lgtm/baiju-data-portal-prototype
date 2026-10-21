// 只做一件事：no-undef。前端是无构建的多个 <script>，拆分 / 改动时最常见的错误是「用了没有定义的变量」，
// 这类错误只有运行到那段代码才会暴露（ReferenceError）。这条规则把它们提前到测试阶段。
import globals from "globals";

export default [
  { ignores: ["assets/vendor/**", "node_modules/**", "baiju-data-portal-feishu-standalone.html"] },
  {
    files: ["assets/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: { ...globals.browser } },
    rules: { "no-undef": "error" }
  }
];
