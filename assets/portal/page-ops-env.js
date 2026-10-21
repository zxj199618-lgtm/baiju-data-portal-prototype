/**
 * 页面：ops-env
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    ep,
    mount,
    notify
  } = window.PortalVue;


    const ENV_DOMAIN_KEY = "gxt-env-domains-v1";
  const ENV_DOMAIN_DEFAULTS = [
    {
      id: "g-specialist", title: "投放助手域名", cols: ["环境", "地址"], note: "",
      rows: [
        { a: "生产", b: "https://ad-api-specialist.kaboss.cn" },
        { a: "SIT", b: "https://ad-api-specialist-sit.kaboss.cn" }
      ]
    },
    {
      id: "g-report", title: "媒体报表 API 域名", cols: ["环境", "地址"], note: "",
      rows: [
        { a: "生产", b: "https://ad-api-report.kaboss.cn" },
        { a: "SIT", b: "https://ad-api-report-sit.kaboss.cn" }
      ]
    },
    {
      id: "g-openapi", title: "对外 API 服务域名（dataworks / CPA / 观星台 / 统一对外查询）", cols: ["环境", "地址"], note: "ELK 项目名：prod_apigatewayadmin",
      rows: [
        { a: "生产", b: "https://data-openapi-report.kaboss.cn" },
        { a: "SIT", b: "https://data-openapi-report-sit.kaboss.cn" }
      ]
    },
    {
      id: "g-redis", title: "SIT + DEV Redis", cols: ["项目", "值"], note: "",
      rows: [
        { a: "内网地址", b: "r-wz96lmr3oj3dtdvtoh.redis.cn-shenzhen.rds.aliyuncs.com" },
        { a: "公网地址", b: "r-wz96lmr3oj3dtdvtohpd-ali.redis.cn-shenzhen.rds.aliyuncs.com" }
      ]
    },
    {
      id: "g-elk", title: "日志查看（ELK）", cols: ["环境", "地址"], note: "可搜索项目：\nprod_ad_specialist_helper\nprod_ad-report-api\napigatewayadmin",
      rows: [
        { a: "生产", b: "http://elk.kaboss.cn/" },
        { a: "测试", b: "https://elk-dev.kaboss.cn/" }
      ]
    }
  ];
  function loadEnvGroups() {
    try {
      const raw = localStorage.getItem(ENV_DOMAIN_KEY);
      if (!raw) return JSON.parse(JSON.stringify(ENV_DOMAIN_DEFAULTS));
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return JSON.parse(JSON.stringify(ENV_DOMAIN_DEFAULTS));
      return parsed.filter(group => group && typeof group.title === "string").map(group => ({
        id: group.id || ("g-" + Math.random().toString(36).slice(2, 9)),
        title: group.title,
        cols: Array.isArray(group.cols) && group.cols.length >= 2 ? [String(group.cols[0]), String(group.cols[1])] : ["环境", "地址"],
        note: typeof group.note === "string" ? group.note : "",
        rows: Array.isArray(group.rows) ? group.rows.filter(row => row && (row.a || row.b)).map(row => ({ a: String(row.a || ""), b: String(row.b || "") })) : []
      }));
    } catch (e) { return JSON.parse(JSON.stringify(ENV_DOMAIN_DEFAULTS)); }
  }

  const OpsEnvApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel" style="padding:18px 22px 24px">
          <div class="portal-vue-toolbar" style="padding:0 0 14px">
            <div class="portal-vue-toolbar-left"><span class="portal-vue-muted">{{ envEditing ? "编辑中：各分类均可新增 / 修改 / 删除条目，改动即时保存" : "当前为只读展示，点击右上角「✎ 编辑」后可维护" }}</span></div>
            <div class="portal-vue-actions">
              <el-button v-if="(!envEditing) && canEdit('环境域名')" type="primary" plain @click="envEditing=true">✎ 编辑</el-button>
              <template v-else>
                <el-button v-if="canEdit('环境域名')" type="primary" @click="openGroupDialog(null)">＋ 新增分类</el-button>
                <el-button v-if="canEdit('环境域名')" @click="envEditing=false">退出编辑</el-button>
              </template>
            </div>
          </div>
          <div v-for="(group, gi) in envGroups" :key="group.id" class="portal-vue-env-group">
            <div class="portal-vue-env-group-head">
              <h3>{{ (gi + 1) + ". " + group.title }}</h3>
              <div v-if="envEditing" class="portal-vue-actions">
                <el-button v-if="canEdit('环境域名')" link type="primary" @click="openEntryDialog(group, null)">＋ 新增条目</el-button>
                <el-button v-if="canEdit('环境域名')" link type="primary" @click="openGroupDialog(group)">编辑分类</el-button>
                <el-popconfirm title="确定删除该分类及其下所有条目吗？" @confirm="removeGroup(group.id)">
                  <template #reference><el-button link type="danger">删除</el-button></template>
                </el-popconfirm>
              </div>
            </div>
            <el-table :data="group.rows" class="portal-vue-table" border empty-text="暂无条目，点本分类右上角「＋ 新增条目」添加">
              <el-table-column :label="group.cols[0]" width="220"><template #default="scope"><span>{{ scope.row.a }}</span></template></el-table-column>
              <el-table-column :label="group.cols[1]" min-width="300"><template #default="scope"><code class="portal-vue-code portal-vue-env-addr">{{ scope.row.b }}</code></template></el-table-column>
              <el-table-column label="操作" v-if="envEditing" width="130" align="center"><template #default="scope"><el-button v-if="canEdit('环境域名')" link type="primary" @click="openEntryDialog(group, scope.$index)">编辑</el-button><el-popconfirm title="确定删除该条目吗？" @confirm="removeEntry(group, scope.$index)"><template #reference><el-button link type="danger">删除</el-button></template></el-popconfirm></template></el-table-column>
            </el-table>
          </div>
          <el-empty v-if="!envGroups.length" description="暂无分类，点上方「✎ 编辑」后再「＋ 新增分类」" />
          <el-dialog v-model="groupDialogVisible" :title="editingGroupId ? '编辑分类' : '新增分类'" width="520px" :close-on-click-modal="true">
            <el-form label-position="top" class="portal-vue-dialog-form">
              <el-form-item label="分类名称" required><el-input v-model="groupForm.title" placeholder="例如：投放助手域名"></el-input></el-form-item>
              <el-form-item label="第一列列名"><el-input v-model="groupForm.colA" placeholder="例如：环境"></el-input></el-form-item>
              <el-form-item label="第二列列名"><el-input v-model="groupForm.colB" placeholder="例如：地址"></el-input></el-form-item>
            </el-form>
            <template #footer><el-button @click="groupDialogVisible=false">取消</el-button><el-button v-if="canEdit('环境域名')" type="primary" @click="saveGroup">保存</el-button></template>
          </el-dialog>
          <el-dialog v-model="entryDialogVisible" :title="(editingEntryIndex === null ? '新增条目' : '编辑条目') + ' · ' + (activeGroup ? activeGroup.title : '')" width="520px" :close-on-click-modal="true">
            <el-form label-position="top" class="portal-vue-dialog-form">
              <el-form-item :label="activeGroup ? activeGroup.cols[0] : '第一列'" required><el-input v-model="entryForm.a" placeholder="例如：生产"></el-input></el-form-item>
              <el-form-item :label="activeGroup ? activeGroup.cols[1] : '第二列'" required><el-input v-model="entryForm.b" placeholder="例如：https://xxx.kaboss.cn"></el-input></el-form-item>
            </el-form>
            <template #footer><el-button @click="entryDialogVisible=false">取消</el-button><el-button v-if="canEdit('环境域名')" type="primary" @click="saveEntry">保存</el-button></template>
          </el-dialog>
        </section>
      </el-config-provider>
    `,
    data: () => ({
      envGroups: loadEnvGroups(),
      envEditing: false,
      groupDialogVisible: false,
      entryDialogVisible: false,
      editingGroupId: null,
      activeGroupId: null,
      editingEntryIndex: null,
      groupForm: { title: "", colA: "环境", colB: "地址" },
      entryForm: { a: "", b: "" }
    }),
    computed: {
      activeGroup() { return this.envGroups.find(group => group.id === this.activeGroupId) || null; }
    },
    methods: {
      persist(silent) {
        try { localStorage.setItem(ENV_DOMAIN_KEY, JSON.stringify(this.envGroups)); } catch (e) {}
        if (!silent) notify("已保存");
      },
      openGroupDialog(group) {
        this.editingGroupId = group ? group.id : null;
        this.groupForm = group
          ? { title: group.title, colA: group.cols[0], colB: group.cols[1] }
          : { title: "", colA: "环境", colB: "地址" };
        this.groupDialogVisible = true;
      },
      saveGroup() {
        const title = this.groupForm.title.trim();
        if (!title) return ep.ElMessage.warning("请填写分类名称");
        const colA = this.groupForm.colA.trim() || "第一列";
        const colB = this.groupForm.colB.trim() || "第二列";
        if (this.editingGroupId) {
          const group = this.envGroups.find(item => item.id === this.editingGroupId);
          if (group) Object.assign(group, { title, cols: [colA, colB] });
        } else {
          this.envGroups.push({ id: "g-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title, cols: [colA, colB], note: "", rows: [] });
        }
        this.groupDialogVisible = false;
        this.persist();
      },
      removeGroup(id) {
        this.envGroups = this.envGroups.filter(group => group.id !== id);
        this.persist();
      },
      openEntryDialog(group, index) {
        this.activeGroupId = group.id;
        this.editingEntryIndex = index === null || index === undefined ? null : index;
        const row = this.editingEntryIndex === null ? null : group.rows[this.editingEntryIndex];
        this.entryForm = row ? { a: row.a, b: row.b } : { a: "", b: "" };
        this.entryDialogVisible = true;
      },
      saveEntry() {
        const group = this.activeGroup;
        if (!group) return;
        const a = this.entryForm.a.trim();
        const b = this.entryForm.b.trim();
        if (!a || !b) return ep.ElMessage.warning("请填写完整的两列内容");
        if (this.editingEntryIndex === null) group.rows.push({ a, b });
        else Object.assign(group.rows[this.editingEntryIndex], { a, b });
        this.entryDialogVisible = false;
        this.persist();
      },
      removeEntry(group, index) {
        group.rows.splice(index, 1);
        this.persist();
      }
    }
  };
  mount("#opsEnvView", OpsEnvApp, "ops-env");
})();
