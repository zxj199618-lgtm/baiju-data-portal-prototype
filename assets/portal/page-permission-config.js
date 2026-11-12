/**
 * 页面：permission-config
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    DEPT_SEPARATOR,
    FieldPermissionDialog,
    USER_SCOPE_PREFIX,
    analysisGatewayBase,
    bridge,
    ep,
    expandMenuNames,
    fetchGateway,
    gatewayFieldsError,
    gatewayTableNames,
    loadGatewayFields,
    manageScopeOf,
    manageScopeSummary,
    menuGrantItems,
    mount,
    notify,
    orgSync,
    permissionFieldsOf,
    permissionTables,
    refreshTick,
    scopeMatched,
    state
  } = window.PortalVue;


  /* 个人表 / 字段设置以服务端为准：打开页面时从 GET /v1/permissions 回显（仅管理员、网关可达，且先取到网关的表与字段）。
     本页会话里保存没能同步到网关的用户（只存在页面状态里）不再被服务端覆盖 */
  const localOnlyUsers = new Set();
  const cloneFieldMap = map => Object.fromEntries(Object.entries(map && typeof map === "object" ? map : {}).filter(([, list]) => Array.isArray(list) && list.length).map(([table, list]) => [table, [...list]]));
  /**
   * 取该用户在服务端的权限条目：{ entry, status }。status：ok；skipped（非管理员、只存在页面状态）；
   * timeout / failed（网关卡住或有响应但不成功）；offline（连不上，演示环境未启动网关）。
   * 只有同时取到了网关字段（gatewayTableNames）才会回显
   */
  async function fetchPermissionEntry(user) {
    if (!user || orgSync.role !== "admin" || localOnlyUsers.has(user.name)) return { entry: null, status: "skipped" };
    try {
      const { response, error } = await fetchGateway("/v1/permissions");
      if (error) return { entry: null, status: error };
      if (!response.ok) return { entry: null, status: "failed" };
      const entry = ((await response.json()).users || []).find(item => item.name === user.name);
      if (localOnlyUsers.has(user.name)) return { entry: null, status: "skipped" };
      return entry ? { entry, status: "ok" } : { entry: null, status: "failed" };
    } catch (error) { return { entry: null, status: "failed" }; }
  }
  /** 网关在（至少一个请求有响应或超时），但两个请求没有都成功：回显不了，提醒管理员；完全离线的演示环境不提示 */
  function warnIfNotHydrated(status) {
    if (status === "skipped") return;
    const fieldsOk = Boolean(gatewayTableNames());
    if (fieldsOk && status === "ok") return;
    const fieldsError = gatewayFieldsError();
    const reachable = fieldsOk || status === "ok" || status === "timeout" || status === "failed" || fieldsError === "timeout" || fieldsError === "failed";
    if (reachable) ep.ElMessage.warning("未能读取该用户已保存的个人权限，保存会按当前页面内容覆盖");
  }
  function seedUser(user, entry) {
    // override.tables 只含个人追加的表；存的是「全部数据表」时记住这个标记（保存时若仍全选则原样写回），勾选状态展开为网关认识的全部表
    const personal = Array.isArray(entry.override?.tables) ? entry.override.tables : [];
    const known = gatewayTableNames() || [];
    user.tableGrantsAll = personal.includes("全部数据表");
    user.tableGrants = user.tableGrantsAll ? [...known] : personal.filter(name => name !== "全部数据表" && known.includes(name));
    user.fieldHidden = cloneFieldMap(entry.hiddenFields);
    // 服务端返回的是有效的追加字段（绑定当前组、限于组当前隐藏的字段）
    user.fieldGrants = cloneFieldMap(entry.grantedFields);
  }

  function buildDepartmentTree(users) {
    const tree = [];
    const seen = new Map();
    users.forEach(user => {
      const path = String(user.dept || "未挂部门");
      let nodes = tree;
      let prefix = "";
      path.split(DEPT_SEPARATOR).forEach(part => {
        prefix = prefix ? prefix + DEPT_SEPARATOR + part : part;
        let node = seen.get(prefix);
        if (!node) {
          node = { value: prefix, label: part, children: [] };
          seen.set(prefix, node);
          nodes.push(node);
        }
        nodes = node.children;
      });
      const personKey = USER_SCOPE_PREFIX + user.name;
      if (!seen.has(personKey)) {
        const person = { value: personKey, label: user.name, member: true, children: [] };
        seen.set(personKey, person);
        nodes.push(person);
      }
    });
    return tree;
  }

  const PermissionConfigApp = {
    template: `
      <el-config-provider :locale="locale">
        <div class="portal-vue-form-page">
          <el-page-header class="portal-vue-form-header" title="返回用户管理" content="配置用户权限" @back="back"></el-page-header>
          <div class="portal-vue-split" style="grid-template-columns:280px minmax(0,1fr)">
            <aside class="portal-vue-split-left"><div class="portal-vue-split-body" v-if="user"><div style="display:flex;align-items:center;gap:12px;margin-bottom:18px"><el-avatar :size="42">{{ user.name.slice(0,1) }}</el-avatar><div><span class="portal-vue-name">{{ user.name }}</span><div class="portal-vue-muted" style="margin-top:4px">{{ user.dept }}</div></div></div><div class="portal-vue-detail-item"><span>岗位角色</span><strong>{{ user.role }}</strong></div><div class="portal-vue-detail-item" style="margin-top:10px"><span>当前权限组</span><strong>{{ user.group }}</strong></div><div class="portal-vue-detail-item" style="margin-top:10px"><span>组内权限</span><strong>{{ inherited ? lockedTotal + ' 项 · 不可关闭' : '未加入权限组' }}</strong></div><div class="portal-vue-detail-item" style="margin-top:10px"><span>个人追加</span><strong>{{ personalTotal }} 项</strong></div><div class="portal-vue-detail-item" style="margin-top:10px"><span>账号状态</span><strong>{{ user.status }}</strong></div></div></aside>
            <section class="portal-vue-split-right"><div class="portal-vue-permission-body">
              <el-alert v-if="inherited" class="portal-vue-inherit-alert" type="info" show-icon :closable="false" title="权限组权限不可关闭" :description="'该用户属于权限组「' + user.group + '」，组内已授予的权限已锁定勾选（标签即权限组名称），个人配置只能在此基础上追加，不能取消；如需收回请调整权限组或将该用户移出权限组。'"></el-alert>
              <el-alert v-if="directBoardNames.size" class="portal-vue-inherit-alert" type="warning" show-icon :closable="false" title="看板直接授权" :description="'有 ' + directBoardNames.size + ' 个看板在「看板管理 - 可查看用户」里直接授权给该用户（标签显示「直接授权」），无需加入权限组即可查看；取消勾选并保存即收回该看板的直接授权。'"></el-alert>
              <el-tabs v-model="activeTab"><el-tab-pane label="菜单权限" name="menus"></el-tab-pane><el-tab-pane label="看板权限" name="boards"></el-tab-pane><el-tab-pane label="表权限" name="tables"></el-tab-pane><el-tab-pane label="管理范围" name="scope"></el-tab-pane></el-tabs>
              <div v-show="activeTab==='menus'" class="portal-vue-permission-grid"><div class="portal-vue-permission-block" style="grid-column:1/-1"><strong>菜单权限（查看 / 编辑）</strong><p class="portal-vue-muted" style="margin:0">「查看」决定菜单是否可见，「编辑」决定该菜单内能否新增/修改/删除；勾选编辑会自动带上查看。带权限组名称的项由该权限组授予，个人配置中不可取消。</p></div><div v-for="section in state.nav" :key="section.group" class="portal-vue-permission-block"><strong v-if="permItems(section).length>1">{{ section.group }}</strong><div v-for="item in permItems(section)" :key="item.name" class="portal-vue-menu-row"><span class="portal-vue-menu-name" :class="{'portal-vue-menu-name-parent': permItems(section).length===1}">{{ item.name }}</span><span class="portal-vue-menu-checks"><el-checkbox class="portal-vue-view-check" :model-value="selectedMenus.includes(item.name)" :disabled="isMenuLocked(item)" @change="value=>togglePersonalView(item.name,value)"><span>查看</span><el-tag v-if="isMenuLocked(item)" size="small" type="info" effect="plain" class="portal-vue-lock-tag" :title="'来自权限组：' + user.group">{{ user.group }}</el-tag></el-checkbox><el-checkbox class="portal-vue-edit-check" :model-value="selectedMenuEdits.includes(item.name)" :disabled="isMenuEditLocked(item)" @change="value=>togglePersonalEdit(item.name,value)"><span>编辑</span><el-tag v-if="isMenuEditLocked(item)" size="small" type="info" effect="plain" class="portal-vue-lock-tag" :title="'来自权限组：' + user.group">{{ user.group }}</el-tag></el-checkbox></span></div></div></div>
              <div v-show="activeTab==='boards'" class="portal-vue-permission-grid"><div v-for="group in boardGroups" :key="group.category" class="portal-vue-permission-block"><strong>{{ group.category }}</strong><el-checkbox v-for="board in group.boards" :key="board.name" v-model="selectedBoards" :value="board.name" :disabled="isBoardLocked(board)" style="display:flex;margin:8px 0"><span>{{ board.name }}</span><el-tag v-if="isBoardDirect(board)" size="small" type="warning" effect="plain" class="portal-vue-lock-tag" :title="'来自「看板管理 - 可查看用户」直接授权，取消勾选并保存即收回'">直接授权</el-tag><el-tag v-else-if="isBoardLocked(board)" size="small" type="info" effect="plain" class="portal-vue-lock-tag" :title="'来自权限组：' + user.group">{{ user.group }}</el-tag></el-checkbox></div></div>
              <div v-show="activeTab==='tables'" class="portal-vue-permission-grid"><div class="portal-vue-permission-block" style="grid-column:1/-1"><el-checkbox :model-value="allTablesSelected" :indeterminate="tablesIndeterminate" :disabled="groupAllTables" @change="toggleAllTables"><span>全部数据表</span><el-tag v-if="groupAllTables" size="small" type="info" effect="plain" class="portal-vue-lock-tag" :title="'来自权限组：' + user.group">{{ user.group }}</el-tag></el-checkbox><p class="portal-vue-muted" style="margin:6px 0 0">{{ inherited ? '带权限组名称标签的数据表由权限组授予，不可取消；其余数据表可以按需追加。未勾选任何数据表时，该用户无法在灵犀智析发起分析。' : '未加入权限组，可自由配置个人数据表权限；未勾选任何数据表时，该用户无法在灵犀智析发起分析。' }}</p></div><div v-if="skillTableRefs.length" class="portal-vue-permission-block" style="grid-column:1/-1" data-test="skill-table-refs"><strong>Skill 引用的表</strong><p class="portal-vue-muted" style="margin:6px 0 0">这些表被 Skill 引用，分析时会用到。勾选即授予该用户这张表（与下方数据表权限相同）；带权限组名称的由权限组授予，不可取消。</p><div v-for="ref in skillTableRefs" :key="ref.name" class="portal-vue-table-perm"><div class="portal-vue-table-perm-row"><el-checkbox v-if="ref.known" v-model="selectedTables" :value="ref.name" :disabled="groupTableNames.has(ref.name)" style="display:flex;margin:8px 0"><span>{{ ref.name }}</span><el-tag v-if="groupTableNames.has(ref.name)" size="small" type="info" effect="plain" class="portal-vue-lock-tag" :title="'来自权限组：' + user.group">{{ user.group }}</el-tag></el-checkbox><span v-else class="portal-vue-muted" style="margin:8px 0"><span>{{ ref.name }}</span> <el-tag size="small" type="danger" effect="plain">未在表清单中，无法授权</el-tag></span><el-tag v-for="label in ref.skills" :key="label" size="small" effect="plain" style="margin-left:6px">{{ label }}</el-tag></div></div></div><div v-for="group in tableGroups" :key="group.source" class="portal-vue-permission-block"><strong>{{ group.source }}</strong><div v-for="table in group.tables" :key="table.cnName" class="portal-vue-table-perm"><div class="portal-vue-table-perm-row"><el-checkbox v-model="selectedTables" :value="table.cnName" :disabled="isTableLocked(table)" style="display:flex;margin:8px 0"><span>{{ table.cnName }}</span><el-tag v-if="isTableLocked(table)" size="small" type="info" effect="plain" class="portal-vue-lock-tag" :title="'来自权限组：' + user.group">{{ user.group }}</el-tag></el-checkbox><span v-if="fieldTagVisible(table)" class="portal-vue-field-tag" :class="{partial:hiddenCount(table)>0}" data-test="field-tag" aria-haspopup="dialog" role="button" tabindex="0" @click="toggleFieldPanel(table)" @keydown.enter.prevent="toggleFieldPanel(table)" @keydown.space.prevent="toggleFieldPanel(table)">{{ fieldLabel(table) }}</span></div></div></div></div>
              <div v-show="activeTab==='scope'" class="portal-vue-permission-grid">
                <div class="portal-vue-permission-block" style="grid-column:1/-1">
                  <div class="portal-vue-scope-head"><el-checkbox v-model="scopeAll">全部用户（不受部门限制）</el-checkbox><span class="portal-vue-muted">候选范围来自系统用户的部门与成员：选中部门=该部门及下级部门所有人自动纳入，也可以直接勾选具体成员</span></div>
                  <el-tree-select v-model="selectedScope" class="portal-vue-scope-tree" :data="deptTree" :props="scopeTreeProps" multiple filterable show-checkbox check-strictly clearable collapse-tags collapse-tags-tooltip :max-collapse-tags="3" :disabled="scopeAll" placeholder="选择部门或成员（可多选）"></el-tree-select>
                  <p class="portal-vue-muted" style="margin:10px 0 0">{{ scopeSummary }}</p>
                </div>
                <div class="portal-vue-permission-block" style="grid-column:1/-1">
                  <strong>管理范围内的用户（{{ scopeUserCount }} 人）</strong>
                  <div class="portal-vue-scope-preview"><el-tag v-for="name in scopePreview" :key="name" size="small" effect="plain">{{ name }}</el-tag><span v-if="!scopePreview.length" class="portal-vue-muted">未配置管理范围的用户，在「用户管理」里只能看到自己</span></div>
                </div>
              </div>
            </div></section>
          </div>
          <field-permission-dialog v-model="fieldDialog.visible" :title="'设置字段权限 · '+fieldDialog.table" :subtitle="dialogSubtitle" :fields="dialogFields" :hidden="dialogHidden" :locked-names="dialogLocked" :lock-label="user?.group" @confirm="applyFields"></field-permission-dialog>
          <div class="portal-vue-form-actions"><el-button @click="back">取消</el-button><el-button v-if="canEdit('用户管理')" type="primary" :loading="hydrating" :aria-busy="hydrating?'true':'false'" :title="hydrating?'正在读取该用户已保存的权限':''" @click="save">保存权限</el-button></div>
        </div>
      </el-config-provider>
    `,
    components:{FieldPermissionDialog},
    data:()=>({state,activeTab:"menus",selectedMenus:[],selectedMenuEdits:[],selectedBoards:[],selectedTables:[],selectedScope:[],scopeAll:false,personalHidden:{},personalGranted:{},fieldDialog:{visible:false,table:""},loadedSnapshot:"",hydrating:false,hydrateSeq:0,skillRefs:[]}),
    computed:{
      user(){refreshTick.value;return state.users[bridge.getActiveUserIndex()]||state.users[0];},
      group(){refreshTick.value;return state.groups.find(group=>group.name===this.user?.group);},
      inherited(){return Boolean(this.group)&&this.user?.group!=="未分配";},
      onlineBoardNames(){refreshTick.value;return state.boards.filter(board=>board.status==="已上线").map(board=>board.name);},
      groupMenuNames(){return expandMenuNames(this.group?.menus||[]);},
      groupMenuEditNames(){return expandMenuNames(this.group?.menuEdits||[]);},
      groupBoardNames(){const grants=this.group?.boards||[];if(grants.includes("全部看板"))return new Set(this.onlineBoardNames);const names=new Set();state.boards.filter(board=>board.status==="已上线"&&(grants.includes(board.name)||grants.includes(board.category))).forEach(board=>names.add(board.name));return names;},
      // 看板管理里「可查看用户」直接授权给该用户的看板（与权限组授权取并集，单独打标签）
      directBoardNames(){refreshTick.value;const name=this.user?.name;if(!name)return new Set();return new Set(state.boards.filter(board=>board.status==="已上线"&&Array.isArray(board.users)&&board.users.includes(name)).map(board=>board.name));},
      groupTableNames(){const grants=this.group?.tables||[];if(grants.includes("全部数据表"))return new Set(this.allTableNames);return new Set(this.allTableNames.filter(name=>grants.includes(name)));},
      groupAllTables(){return (this.group?.tables||[]).includes("全部数据表");},
      lockedTotal(){return this.groupMenuNames.size+this.groupBoardNames.size+this.groupTableNames.size;},
      personalTotal(){return (this.user?.menuGrants||[]).length+(this.user?.boardGrants||[]).length+(this.user?.tableGrants||[]).filter(name=>name!=="全部数据表").length;},
      deptTree(){refreshTick.value;return buildDepartmentTree(state.users);},
      scopeTreeProps(){return { label: "label", children: "children", class: data => data?.member ? "portal-vue-scope-member-node" : "" };},
      scopePreview(){refreshTick.value;if(this.scopeAll)return state.users.map(user=>user.name);const scope=this.selectedScope.filter(Boolean);if(!scope.length)return this.user?[this.user.name]:[];return state.users.filter(user=>user.name===this.user?.name||scopeMatched(user,scope)).map(user=>user.name);},
      scopeUserCount(){return this.scopePreview.length;},
      scopeSummary(){if(this.scopeAll)return `已配置为「全部用户」：该用户在「用户管理」里可以看到全部 ${state.users.length} 名用户。`;const scope=this.selectedScope.filter(Boolean);if(!scope.length)return "未配置任何部门或成员：该用户在「用户管理」里只能看到自己。";return `已选择 ${manageScopeSummary({ manageScope: scope })}：该用户在「用户管理」里可以看到范围内 ${this.scopeUserCount} 名用户（含自己）。`;},
      boardGroups(){return state.categories.filter(category=>category!=="全部").map(category=>({category,boards:state.boards.filter(board=>board.category===category&&board.status==="已上线")})).filter(group=>group.boards.length);},
      tableGroups(){const groups=[];permissionTables().forEach(table=>{let group=groups.find(item=>item.source===table.source);if(!group){group={source:table.source,tables:[]};groups.push(group);}group.tables.push(table);});return groups;},
      // 门户管理员与「全部数据表」的权限组不限制字段，不显示字段面板
      fieldPanelsEnabled(){return this.user?.group!=="门户管理员"&&!this.groupAllTables;},
      dialogTable(){return this.tableGroups.flatMap(group=>group.tables).find(table=>table.cnName===this.fieldDialog.table);},
      dialogFields(){return this.dialogTable?this.tableFields(this.dialogTable):[];},
      dialogHidden(){return this.dialogTable?this.effectiveHiddenOf(this.dialogTable):[];},
      dialogLocked(){const table=this.dialogTable;if(!table||!this.isTableLocked(table))return [];const hidden=this.groupHiddenOf(table);return this.dialogFields.map(field=>field.name).filter(name=>!hidden.includes(name));},
      dialogSubtitle(){return `用户：${this.user?.name||""}`+(this.inherited?` · 权限组：${this.user.group}`:"");},
      allTableNames(){return permissionTables().map(table=>table.cnName);},
      allTablesSelected(){return this.selectedTables.length>0&&this.selectedTables.length>=this.allTableNames.length;},
      tablesIndeterminate(){return this.selectedTables.length>0&&this.selectedTables.length<this.allTableNames.length;},
      // 按表汇总：每张被 Skill 引用的表，列出引用它的 Skill
      skillTableRefs(){refreshTick.value;const map=new Map();this.skillRefs.forEach(ref=>ref.tables.forEach(name=>{if(!map.has(name))map.set(name,[]);map.get(name).push(ref.skill);}));return [...map].map(([name,skills])=>({name,skills,known:this.allTableNames.includes(name)}));}
    },
    watch:{
      // 取消勾选某张表 = 收回该表上的个人字段设置
      selectedTables(list){const keep=new Set(list);[this.personalHidden,this.personalGranted].forEach(map=>Object.keys(map).forEach(name=>{if(!keep.has(name))delete map[name];}));if(this.fieldDialog.table&&!keep.has(this.fieldDialog.table))this.fieldDialog.visible=false;}
    },
    mounted(){this.pageHandler=event=>{if(event.detail?.page==="配置权限")this.open();};window.addEventListener("portal:page-change",this.pageHandler);this.open();this.loadSkillRefs();},
    beforeUnmount(){window.removeEventListener("portal:page-change",this.pageHandler);},
    methods:{
      permItems(section){return menuGrantItems(section);},
      /* Skill 引用的表：从网关 /v1/skills 取（未引用任何表的 Skill 不列出） */
      async loadSkillRefs(){
        try{
          const { response, error } = await fetchGateway("/v1/skills");
          if(error||!response.ok)return;
          const list=await response.json();
          this.skillRefs=(Array.isArray(list)?list:[]).filter(entry=>Array.isArray(entry.tables)&&entry.tables.length).map(entry=>({skill:entry.title||entry.name||entry.id,tables:entry.tables}));
        }catch(error){/* 网关未连接时不显示 */}
      },
      isMenuLocked(item){return this.inherited&&this.groupMenuNames.has(item.name);},
      isMenuEditLocked(item){return this.inherited&&this.groupMenuEditNames.has(item.name);},
      isBoardLocked(board){return this.inherited&&this.groupBoardNames.has(board.name);},
      isBoardDirect(board){return this.directBoardNames.has(board.name);},
      isTableLocked(table){return this.inherited&&this.groupTableNames.has(table.cnName);},
      tableFields(table){return permissionFieldsOf(table.cnName);},
      groupHiddenOf(table){return this.isTableLocked(table)?(this.group?.hiddenFields?.[table.cnName]||[]):[];},
      // 当前对该用户隐藏的字段：组授予的表 = 组隐藏 − 个人追加；个人追加的表 = 个人取消勾选的
      effectiveHiddenOf(table){if(this.isTableLocked(table)){const granted=this.personalGranted[table.cnName]||[];return this.groupHiddenOf(table).filter(name=>!granted.includes(name));}return this.personalHidden[table.cnName]||[];},
      hiddenCount(table){return this.effectiveHiddenOf(table).length;},
      fieldTagVisible(table){return this.fieldPanelsEnabled&&this.selectedTables.includes(table.cnName)&&this.tableFields(table).length>0;},
      fieldLabel(table){const fields=this.tableFields(table);const hidden=this.hiddenCount(table);return hidden?`字段 ${fields.length-hidden}/${fields.length}`:"全部字段";},
      toggleFieldPanel(table){this.fieldDialog.table=table.cnName;this.fieldDialog.visible=true;},
      setFieldMap(map,name,list){if(list.length)map[name]=list;else delete map[name];},
      // 确定才写回：组授予的表只记录个人追加（组隐藏且被勾上的字段），个人追加的表记录取消勾选的字段
      applyFields(hidden){
        const table=this.dialogTable;if(!table)return;
        if(this.isTableLocked(table))this.setFieldMap(this.personalGranted,table.cnName,this.groupHiddenOf(table).filter(name=>!hidden.includes(name)));
        else this.setFieldMap(this.personalHidden,table.cnName,hidden);
      },
      togglePersonalView(name,checked){
        if(this.isMenuLocked({name}))return;
        const index=this.selectedMenus.indexOf(name);
        if(checked&&index<0)this.selectedMenus.push(name);
        else if(!checked&&index>=0){this.selectedMenus.splice(index,1);const editIndex=this.selectedMenuEdits.indexOf(name);if(editIndex>=0)this.selectedMenuEdits.splice(editIndex,1);}
      },
      togglePersonalEdit(name,checked){
        if(this.isMenuEditLocked({name}))return;
        const index=this.selectedMenuEdits.indexOf(name);
        if(checked){if(index<0)this.selectedMenuEdits.push(name);if(!this.selectedMenus.includes(name))this.selectedMenus.push(name);}
        else if(index>=0)this.selectedMenuEdits.splice(index,1);
      },
      // 打开页面：先按现有字段来源回显；首次取到网关的真实字段后再按它重新回显
      // 打开页面：先按现有状态回显；取到网关的真实字段后再读该用户已保存的个人设置，读完之前不能保存。
      // 回显结果只改表 / 字段部分，且只在这部分还没被改动时生效；过期的回显（之后又打开或已保存）丢弃
      open(){
        this.load();
        const user=this.user;const seq=++this.hydrateSeq;this.hydrating=true;
        (async()=>{
          const changed=await loadGatewayFields();
          const {entry:fetched,status}=await fetchPermissionEntry(user);
          if(seq!==this.hydrateSeq||this.user!==user)return;
          // 网关字段与已保存权限都取到才回显；否则沿用页面状态
          const entry=fetched&&gatewayTableNames()?fetched:null;
          if(entry)seedUser(user,entry);else warnIfNotHydrated(status);
          if((changed||entry)&&this.tableSnapshot()===this.loadedSnapshot)this.applyTableState();
        })().finally(()=>{if(seq===this.hydrateSeq)this.hydrating=false;});
      },
      tableSnapshot(){return JSON.stringify([this.selectedTables,this.personalHidden,this.personalGranted]);},
      applyTableState(){
        const personalTables=(Array.isArray(this.user?.tableGrants)?this.user.tableGrants:[]).filter(name=>name!=="全部数据表");
        this.selectedTables=[...new Set([...this.groupTableNames,...personalTables])];
        // 个人字段设置回显：只保留仍勾选的表；组授予的表上只有组隐藏的字段才可追加
        const cloneMap=map=>Object.fromEntries(Object.entries(map||{}).map(([table,list])=>[table,Array.isArray(list)?[...list]:[]]).filter(([table,list])=>list.length&&this.selectedTables.includes(table)));
        this.personalHidden=cloneMap(this.user?.fieldHidden);
        this.personalGranted=cloneMap(this.user?.fieldGrants);
        this.loadedSnapshot=this.tableSnapshot();
      },
      load(){
        const personalMenus=Array.isArray(this.user?.menuGrants)?this.user.menuGrants:[];
        this.selectedMenus=[...new Set([...this.groupMenuNames,...personalMenus])];
        const personalMenuEdits=Array.isArray(this.user?.menuEditGrants)?this.user.menuEditGrants:[];
        this.selectedMenuEdits=[...new Set([...this.groupMenuEditNames,...personalMenuEdits])].filter(name=>this.selectedMenus.includes(name));
        const personalBoards=(Array.isArray(this.user?.boardGrants)?this.user.boardGrants:[]).filter(name=>this.onlineBoardNames.includes(name));
        this.selectedBoards=[...new Set([...this.groupBoardNames,...this.directBoardNames,...personalBoards])];
        this.applyTableState();
        this.fieldDialog.visible=false;
        this.selectedScope=manageScopeOf(this.user);
        this.scopeAll=Boolean(this.user?.manageScopeAll);
      },
      back(){bridge.setPage("用户管理");},
      toggleAllTables(value){
        if(this.groupAllTables)return;
        this.selectedTables=value?[...new Set([...this.groupTableNames,...this.allTableNames])]:[...this.groupTableNames];
      },
      async save(){
        if(!this.user||this.hydrating)return;
        const groupMenus=this.groupMenuNames,groupMenuEdits=this.groupMenuEditNames,groupBoards=this.groupBoardNames,groupTables=this.groupTableNames;
        // 快照本次加载时的「直接授权」看板：取消勾选 = 收回该看板的直接授权（写回看板数据）
        const directBoards=new Set(this.directBoardNames);
        state.boards.forEach(board=>{
          if(Array.isArray(board.users)&&board.users.includes(this.user.name)&&!this.selectedBoards.includes(board.name)){
            board.users=board.users.filter(name=>name!==this.user.name);
          }
        });
        const personalMenus=this.selectedMenus.filter(name=>!groupMenus.has(name));
        const personalMenuEdits=this.selectedMenuEdits.filter(name=>!groupMenuEdits.has(name)&&this.selectedMenus.includes(name));
        const personalBoards=this.selectedBoards.filter(name=>!groupBoards.has(name)&&!directBoards.has(name));
        // 网关不认识的表（只在门户里有）不提交，否则整次保存会被拒绝
        const known=gatewayTableNames();
        const personalTables=this.selectedTables.filter(name=>!groupTables.has(name)&&(!known||known.includes(name)));
        // 原来存的是「全部数据表」且网关认识的非组表仍全部勾选：原样写回标记（之后新增的表也自动授予）；取消过任何一张则改存明确清单
        const keepAllToken=Boolean(this.user.tableGrantsAll)&&Boolean(known)&&known.filter(name=>!groupTables.has(name)).every(name=>this.selectedTables.includes(name));
        this.user.menuGrants=personalMenus;
        this.user.menuEditGrants=personalMenuEdits;
        this.user.boardGrants=personalBoards;
        this.user.tableGrants=personalTables;
        this.user.tableGrantsAll=keepAllToken;
        this.user.manageScope=[...this.selectedScope.filter(Boolean)];
        this.user.manageScopeAll=Boolean(this.scopeAll);
        // 字段设置只保留仍在保存范围内的表：组授予的表只存追加字段（限于组隐藏的字段），个人追加的表只存取消勾选的字段
        const hiddenFields={},grantedFields={};
        this.selectedTables.forEach(name=>{
          const fields=permissionFieldsOf(name);
          if(!fields.length||!this.fieldPanelsEnabled)return;
          if(groupTables.has(name)){const allowed=this.group?.hiddenFields?.[name]||[];const list=(this.personalGranted[name]||[]).filter(field=>allowed.includes(field));if(list.length)grantedFields[name]=list;}
          else{const names=fields.map(field=>field.name);const list=(this.personalHidden[name]||[]).filter(field=>names.includes(field));if(list.length)hiddenFields[name]=list;}
        });
        this.user.fieldHidden=hiddenFields;
        this.user.fieldGrants=grantedFields;
        // 个人覆盖只存个人追加的表（逐表列出，不用「全部数据表」）；组授予的表由网关实时按权限组计算
        const payload=keepAllToken?["全部数据表"]:personalTables;
        let persisted=false;
        try{const response=await fetch(`${analysisGatewayBase}/v1/permissions/${encodeURIComponent(this.user.name)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({tables:payload,hiddenFields,grantedFields})});persisted=response.ok;}catch(error){/* 网关未启动时仅保存在页面状态 */}
        // 同步成功：按服务端结果重新回显（服务端会规范化）；没同步：记为只存在页面状态，之后打开不被服务端覆盖
        // 同时作废还在路上的回显（seq），只认保存后的这次
        if(persisted){const user=this.user;localOnlyUsers.delete(user.name);const seq=++this.hydrateSeq;this.hydrating=false;fetchPermissionEntry(user).then(({entry})=>{if(entry&&gatewayTableNames()&&seq===this.hydrateSeq)seedUser(user,entry);});}else localOnlyUsers.add(this.user.name);
        notify(`${this.user.name} 的权限配置已保存（管理范围：${manageScopeSummary(this.user)}；个人追加：菜单查看 ${personalMenus.length} / 菜单编辑 ${personalMenuEdits.length} / 看板 ${personalBoards.length} / 表 ${personalTables.length} 项；权限组权限保持不变）${persisted?"，已同步到分析网关":"（本地演示，网关未连接）"}`);
        this.back();
      }
    }
  };
  mount("#permissionConfigView", PermissionConfigApp, "permission-config");
})();
