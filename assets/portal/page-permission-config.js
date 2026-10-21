/**
 * 页面：permission-config
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    DEPT_SEPARATOR,
    USER_SCOPE_PREFIX,
    analysisGatewayBase,
    bridge,
    expandMenuNames,
    manageScopeOf,
    manageScopeSummary,
    menuGrantItems,
    mount,
    notify,
    refreshTick,
    scopeMatched,
    state
  } = window.PortalVue;


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
              <div v-show="activeTab==='tables'" class="portal-vue-permission-grid"><div class="portal-vue-permission-block" style="grid-column:1/-1"><el-checkbox :model-value="allTablesSelected" :indeterminate="tablesIndeterminate" :disabled="groupAllTables" @change="toggleAllTables"><span>全部数据表</span><el-tag v-if="groupAllTables" size="small" type="info" effect="plain" class="portal-vue-lock-tag" :title="'来自权限组：' + user.group">{{ user.group }}</el-tag></el-checkbox><p class="portal-vue-muted" style="margin:6px 0 0">{{ inherited ? '带权限组名称标签的数据表由权限组授予，不可取消；其余数据表可以按需追加。未勾选任何数据表时，该用户无法在灵犀智析发起分析。' : '未加入权限组，可自由配置个人数据表权限；未勾选任何数据表时，该用户无法在灵犀智析发起分析。' }}</p></div><div v-for="group in tableGroups" :key="group.source" class="portal-vue-permission-block"><strong>{{ group.source }}</strong><el-checkbox v-for="table in group.tables" :key="table.cnName" v-model="selectedTables" :value="table.cnName" :disabled="isTableLocked(table)" style="display:flex;margin:8px 0"><span>{{ table.cnName }}</span><el-tag v-if="isTableLocked(table)" size="small" type="info" effect="plain" class="portal-vue-lock-tag" :title="'来自权限组：' + user.group">{{ user.group }}</el-tag></el-checkbox></div></div>
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
          <div class="portal-vue-form-actions"><el-button @click="back">取消</el-button><el-button v-if="canEdit('用户管理')" type="primary" @click="save">保存权限</el-button></div>
        </div>
      </el-config-provider>
    `,
    data:()=>({state,activeTab:"menus",selectedMenus:[],selectedMenuEdits:[],selectedBoards:[],selectedTables:[],selectedScope:[],scopeAll:false}),
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
      groupTableNames(){const grants=this.group?.tables||[];if(grants.includes("全部数据表"))return new Set(this.allTableNames);return new Set(state.assets.filter(table=>grants.includes(table.cnName)).map(table=>table.cnName));},
      groupAllTables(){return (this.group?.tables||[]).includes("全部数据表");},
      lockedTotal(){return this.groupMenuNames.size+this.groupBoardNames.size+this.groupTableNames.size;},
      personalTotal(){return (this.user?.menuGrants||[]).length+(this.user?.boardGrants||[]).length+(this.user?.tableGrants||[]).filter(name=>name!=="全部数据表").length;},
      deptTree(){refreshTick.value;return buildDepartmentTree(state.users);},
      scopeTreeProps(){return { label: "label", children: "children", class: data => data?.member ? "portal-vue-scope-member-node" : "" };},
      scopePreview(){refreshTick.value;if(this.scopeAll)return state.users.map(user=>user.name);const scope=this.selectedScope.filter(Boolean);if(!scope.length)return this.user?[this.user.name]:[];return state.users.filter(user=>user.name===this.user?.name||scopeMatched(user,scope)).map(user=>user.name);},
      scopeUserCount(){return this.scopePreview.length;},
      scopeSummary(){if(this.scopeAll)return `已配置为「全部用户」：该用户在「用户管理」里可以看到全部 ${state.users.length} 名用户。`;const scope=this.selectedScope.filter(Boolean);if(!scope.length)return "未配置任何部门或成员：该用户在「用户管理」里只能看到自己。";return `已选择 ${manageScopeSummary({ manageScope: scope })}：该用户在「用户管理」里可以看到范围内 ${this.scopeUserCount} 名用户（含自己）。`;},
      boardGroups(){return state.categories.filter(category=>category!=="全部").map(category=>({category,boards:state.boards.filter(board=>board.category===category&&board.status==="已上线")})).filter(group=>group.boards.length);},
      tableGroups(){const groups=[];state.assets.forEach(table=>{let group=groups.find(item=>item.source===table.source);if(!group){group={source:table.source,tables:[]};groups.push(group);}group.tables.push(table);});return groups;},
      allTableNames(){return state.assets.map(table=>table.cnName);},
      allTablesSelected(){return this.selectedTables.length>0&&this.selectedTables.length>=this.allTableNames.length;},
      tablesIndeterminate(){return this.selectedTables.length>0&&this.selectedTables.length<this.allTableNames.length;}
    },
    mounted(){this.pageHandler=event=>{if(event.detail?.page==="配置权限")this.load();};window.addEventListener("portal:page-change",this.pageHandler);this.load();},
    beforeUnmount(){window.removeEventListener("portal:page-change",this.pageHandler);},
    methods:{
      permItems(section){return menuGrantItems(section);},
      isMenuLocked(item){return this.inherited&&this.groupMenuNames.has(item.name);},
      isMenuEditLocked(item){return this.inherited&&this.groupMenuEditNames.has(item.name);},
      isBoardLocked(board){return this.inherited&&this.groupBoardNames.has(board.name);},
      isBoardDirect(board){return this.directBoardNames.has(board.name);},
      isTableLocked(table){return this.inherited&&this.groupTableNames.has(table.cnName);},
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
      load(){
        const personalMenus=Array.isArray(this.user?.menuGrants)?this.user.menuGrants:[];
        this.selectedMenus=[...new Set([...this.groupMenuNames,...personalMenus])];
        const personalMenuEdits=Array.isArray(this.user?.menuEditGrants)?this.user.menuEditGrants:[];
        this.selectedMenuEdits=[...new Set([...this.groupMenuEditNames,...personalMenuEdits])].filter(name=>this.selectedMenus.includes(name));
        const personalBoards=(Array.isArray(this.user?.boardGrants)?this.user.boardGrants:[]).filter(name=>this.onlineBoardNames.includes(name));
        this.selectedBoards=[...new Set([...this.groupBoardNames,...this.directBoardNames,...personalBoards])];
        const personalTables=(Array.isArray(this.user?.tableGrants)?this.user.tableGrants:[]).filter(name=>name!=="全部数据表");
        this.selectedTables=[...new Set([...this.groupTableNames,...personalTables])];
        this.selectedScope=manageScopeOf(this.user);
        this.scopeAll=Boolean(this.user?.manageScopeAll);
      },
      back(){bridge.setPage("用户管理");},
      toggleAllTables(value){
        if(this.groupAllTables)return;
        this.selectedTables=value?[...new Set([...this.groupTableNames,...this.allTableNames])]:[...this.groupTableNames];
      },
      async save(){
        if(!this.user)return;
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
        const personalTables=this.selectedTables.filter(name=>!groupTables.has(name));
        this.user.menuGrants=personalMenus;
        this.user.menuEditGrants=personalMenuEdits;
        this.user.boardGrants=personalBoards;
        this.user.tableGrants=personalTables;
        this.user.manageScope=[...this.selectedScope.filter(Boolean)];
        this.user.manageScopeAll=Boolean(this.scopeAll);
        const effectiveTables=[...new Set([...groupTables,...personalTables])];
        const payload=personalTables.length?(effectiveTables.length>=this.allTableNames.length?["全部数据表"]:effectiveTables):[];
        let persisted=false;
        try{const response=await fetch(`${analysisGatewayBase}/v1/permissions/${encodeURIComponent(this.user.name)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({tables:payload})});persisted=response.ok;}catch(error){/* 网关未启动时仅保存在页面状态 */}
        notify(`${this.user.name} 的权限配置已保存（管理范围：${manageScopeSummary(this.user)}；个人追加：菜单查看 ${personalMenus.length} / 菜单编辑 ${personalMenuEdits.length} / 看板 ${personalBoards.length} / 表 ${personalTables.length} 项；权限组权限保持不变）${persisted?"，已同步到分析网关":"（本地演示，网关未连接）"}`);
        this.back();
      }
    }
  };
  mount("#permissionConfigView", PermissionConfigApp, "permission-config");
})();
