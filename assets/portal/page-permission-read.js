/**
 * 页面：permission-read
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    bridge,
    expandMenuNames,
    isUserScopeItem,
    manageScopeOf,
    manageScopeSummary,
    mount,
    refreshTick,
    scopeMatched,
    state,
    userScopeName
  } = window.PortalVue;


  // 用户当前生效的权限快照（菜单 / 看板 / 数据表 / 管理范围），供「查看权限」只读页回显
  function permissionsOfUser(user) {
    const group = state.groups.find(item => item.name === user?.group) || null;
    const groupMenus = expandMenuNames(group?.menus || []);
    const groupMenuEdits = expandMenuNames(group?.menuEdits || []);
    const personalMenus = Array.isArray(user?.menuGrants) ? user.menuGrants : [];
    const personalMenuEdits = Array.isArray(user?.menuEditGrants) ? user.menuEditGrants : [];
    const viewMenus = [...new Set([...groupMenus, ...personalMenus])];
    const editMenus = [...new Set([...groupMenuEdits, ...personalMenuEdits])].filter(name => viewMenus.includes(name));
    const boardGrants = [...(group?.boards || []), ...(Array.isArray(user?.boardGrants) ? user.boardGrants : [])];
    const allBoards = boardGrants.includes("全部看板");
    const grantedBoards = (allBoards ? state.boards.filter(board => board.status === "已上线") : state.boards.filter(board => board.status === "已上线" && (boardGrants.includes(board.name) || boardGrants.includes(board.category)))).map(board => board.name);
    const directBoards = state.boards.filter(board => board.status === "已上线" && Array.isArray(board.users) && board.users.includes(user?.name)).map(board => board.name);
    const boards = [...new Set([...grantedBoards, ...directBoards])];
    const groupBoardSet = new Set(allBoards ? state.boards.filter(board => board.status === "已上线").map(board => board.name) : state.boards.filter(board => board.status === "已上线" && (boardGrants.includes(board.name) || boardGrants.includes(board.category))).map(board => board.name));
    const tableGrants = [...(group?.tables || []), ...(Array.isArray(user?.tableGrants) ? user.tableGrants : [])];
    const allTables = tableGrants.includes("全部数据表");
    const tables = (allTables ? state.assets : state.assets.filter(table => tableGrants.includes(table.cnName))).map(table => table.cnName);
    const groupTableSet = new Set(allTables ? state.assets.map(table => table.cnName) : state.assets.filter(table => tableGrants.includes(table.cnName)).map(table => table.cnName));
    const personalBoards = (Array.isArray(user?.boardGrants) ? user.boardGrants : []).filter(name => name !== "全部看板");
    const personalTables = (Array.isArray(user?.tableGrants) ? user.tableGrants : []).filter(name => name !== "全部数据表");
    return {
      group, viewMenus, editMenus, boards, directBoards, tables, allBoards, allTables,
      groupMenus: [...groupMenus], groupBoardSet, groupTableSet,
      personalMenus, personalBoards, personalTables,
      scope: manageScopeOf(user), scopeAll: Boolean(user?.manageScopeAll),
      personalTotal: personalMenus.length + personalMenuEdits.length + personalBoards.length + personalTables.length
    };
  }

  // 「查看权限」整页只读版：与「配置用户权限」同一版式（左用户卡片 + 四个 tab），
  // 只回显该用户有权限的菜单 / 看板 / 数据表 / 管理范围内用户，其余项不展示，且不提供任何修改入口。
  const PermissionReadApp = {
    template: `
      <el-config-provider :locale="locale">
        <div class="portal-vue-form-page">
          <el-page-header class="portal-vue-form-header" title="返回用户管理" :content="user ? '查看权限 · ' + user.name : '查看权限'" @back="back"></el-page-header>
          <el-alert class="portal-vue-inherit-alert" type="info" show-icon :closable="false" title="只读查看" description="仅回显该用户当前生效的权限，此页不支持任何修改；没有权限的菜单、看板、数据表和用户不会展示。如需调整请由门户管理员在「配置权限」中操作。"></el-alert>
          <div class="portal-vue-split" style="grid-template-columns:280px minmax(0,1fr)">
            <aside class="portal-vue-split-left"><div class="portal-vue-split-body" v-if="user"><div style="display:flex;align-items:center;gap:12px;margin-bottom:18px"><el-avatar :size="42">{{ user.name.slice(0,1) }}</el-avatar><div><span class="portal-vue-name">{{ user.name }}</span><div class="portal-vue-muted" style="margin-top:4px">{{ user.dept }}</div></div></div><div class="portal-vue-detail-item"><span>岗位角色</span><strong>{{ user.role }}</strong></div><div class="portal-vue-detail-item" style="margin-top:10px"><span>当前权限组</span><strong>{{ user.group }}</strong></div><div class="portal-vue-detail-item" style="margin-top:10px"><span>可见菜单</span><strong>{{ permissions.viewMenus.length }} 项</strong></div><div class="portal-vue-detail-item" style="margin-top:10px"><span>可见看板</span><strong>{{ permissions.boards.length }} 个</strong></div><div class="portal-vue-detail-item" style="margin-top:10px"><span>可见数据表</span><strong>{{ permissions.tables.length }} 张</strong></div><div class="portal-vue-detail-item" style="margin-top:10px"><span>账号状态</span><strong>{{ user.status }}</strong></div></div></aside>
            <section class="portal-vue-split-right"><div class="portal-vue-permission-body">
              <el-tabs v-model="activeTab"><el-tab-pane label="菜单权限" name="menus"></el-tab-pane><el-tab-pane label="看板权限" name="boards"></el-tab-pane><el-tab-pane label="表权限" name="tables"></el-tab-pane><el-tab-pane label="管理范围" name="scope"></el-tab-pane></el-tabs>
              <div v-show="activeTab==='menus'" class="portal-vue-permission-grid">
                <div class="portal-vue-permission-block" style="grid-column:1/-1"><strong>菜单权限（{{ permissions.viewMenus.length }} 项）</strong><p class="portal-vue-muted" style="margin:0">只列出该用户当前可见的菜单，未授予的菜单不展示；「查看」为菜单可见，「编辑」为该菜单内可新增/修改/删除。带权限组名称的项由该权限组授予。</p></div>
                <div v-for="section in menuSections" :key="section.group" class="portal-vue-permission-block"><strong v-if="section.items.length>1">{{ section.group }}</strong><div v-for="item in section.items" :key="item.name" class="portal-vue-menu-row"><span class="portal-vue-menu-name" :class="{'portal-vue-menu-name-parent': section.items.length===1}">{{ item.name }}</span><span class="portal-vue-menu-checks"><el-checkbox class="portal-vue-view-check" :model-value="true" disabled><span>查看</span></el-checkbox><el-checkbox class="portal-vue-edit-check" :model-value="permissions.editMenus.includes(item.name)" disabled><span>编辑</span></el-checkbox></span></div></div>
                <div v-if="!permissions.viewMenus.length" class="portal-vue-permission-block" style="grid-column:1/-1"><span class="portal-vue-muted">该用户当前没有任何菜单权限。</span></div>
              </div>
              <div v-show="activeTab==='boards'" class="portal-vue-permission-grid">
                <div class="portal-vue-permission-block" style="grid-column:1/-1"><strong>看板权限（{{ permissions.boards.length }} 个）</strong><p class="portal-vue-muted" style="margin:0">{{ permissions.allBoards ? '该用户拥有全部看板权限。' : '只列出该用户当前可查看的看板，未授权的看板不展示。带权限组名称的项由权限组授予，带「直接授权」标签的项由「看板管理 - 可查看用户」直接授权。' }}</p></div>
                <div v-for="group in boardGroups" :key="group.category" class="portal-vue-permission-block"><strong>{{ group.category }}</strong><el-checkbox v-for="board in group.boards" :key="board.name" :model-value="true" disabled style="display:flex;margin:8px 0"><span>{{ board.name }}</span><el-tag v-if="directBoards.has(board.name)" size="small" type="warning" effect="plain" class="portal-vue-read-tag" title="来自「看板管理 - 可查看用户」直接授权">直接授权</el-tag><el-tag v-else-if="groupBoards.has(board.name)" size="small" type="info" effect="plain" class="portal-vue-read-tag" :title="'来自权限组：' + user.group">{{ user.group }}</el-tag></el-checkbox></div>
                <div v-if="!permissions.boards.length" class="portal-vue-permission-block" style="grid-column:1/-1"><span class="portal-vue-muted">该用户当前没有任何看板权限。</span></div>
              </div>
              <div v-show="activeTab==='tables'" class="portal-vue-permission-grid">
                <div class="portal-vue-permission-block" style="grid-column:1/-1"><strong>数据表权限（{{ permissions.tables.length }} 张）</strong><p class="portal-vue-muted" style="margin:0">只列出该用户当前可使用的数据表，未授权的数据表不展示；没有数据表权限时该用户无法在灵犀智析发起分析。</p></div>
                <div v-for="group in tableGroups" :key="group.source" class="portal-vue-permission-block"><strong>{{ group.source }}</strong><el-checkbox v-for="table in group.tables" :key="table.cnName" :model-value="true" disabled style="display:flex;margin:8px 0"><span>{{ table.cnName }}</span><el-tag v-if="groupTables.has(table.cnName)" size="small" type="info" effect="plain" class="portal-vue-read-tag" :title="'来自权限组：' + user.group">{{ user.group }}</el-tag></el-checkbox></div>
                <div v-if="!permissions.tables.length" class="portal-vue-permission-block" style="grid-column:1/-1"><span class="portal-vue-muted">该用户当前没有任何数据表权限。</span></div>
              </div>
              <div v-show="activeTab==='scope'" class="portal-vue-permission-grid">
                <div class="portal-vue-permission-block" style="grid-column:1/-1">
                  <div class="portal-vue-scope-head"><el-checkbox :model-value="permissions.scopeAll" disabled>全部用户（不受部门限制）</el-checkbox><span class="portal-vue-muted">选中部门=该部门及下级部门所有人自动纳入</span></div>
                  <div v-if="scopeTags.length" class="portal-vue-perm-tags" style="margin-top:12px"><el-tag v-for="tag in scopeTags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag></div>
                  <p class="portal-vue-muted" style="margin:10px 0 0">{{ scopeSummary }}</p>
                </div>
                <div class="portal-vue-permission-block" style="grid-column:1/-1">
                  <strong>管理范围内的用户（{{ scopeUsers.length }} 人）</strong>
                  <div class="portal-vue-scope-preview"><el-tag v-for="name in scopeUsers" :key="name" size="small" effect="plain">{{ name }}</el-tag><span v-if="!scopeUsers.length" class="portal-vue-muted">无</span></div>
                </div>
              </div>
            </div></section>
          </div>
        </div>
      </el-config-provider>
    `,
    data:()=>({state,activeTab:"menus"}),
    computed:{
      user(){refreshTick.value;return state.users[bridge.getActiveUserIndex()]||state.users[0];},
      permissions(){refreshTick.value;return this.user?permissionsOfUser(this.user):{group:null,viewMenus:[],editMenus:[],boards:[],directBoards:[],tables:[],allBoards:false,allTables:false,groupMenus:[],groupBoardSet:new Set(),groupTableSet:new Set(),personalMenus:[],personalBoards:[],personalTables:[],scope:[],scopeAll:false,personalTotal:0};},
      directBoards(){return new Set(this.permissions.directBoards||[]);},
      groupBoards(){return this.permissions.groupBoardSet||new Set();},
      groupTables(){return this.permissions.groupTableSet||new Set();},
      menuSections(){return state.nav.map(section=>({group:section.group,items:section.items.filter(item=>this.permissions.viewMenus.includes(item.name))})).filter(section=>section.items.length);},
      boardGroups(){return state.categories.filter(category=>category!=="全部").map(category=>({category,boards:state.boards.filter(board=>board.category===category&&board.status==="已上线"&&this.permissions.boards.includes(board.name))})).filter(group=>group.boards.length);},
      tableGroups(){const groups=[];state.assets.filter(table=>this.permissions.tables.includes(table.cnName)).forEach(table=>{let group=groups.find(item=>item.source===table.source);if(!group){group={source:table.source,tables:[]};groups.push(group);}group.tables.push(table);});return groups;},
      scopeTags(){return (this.permissions.scope||[]).map(item=>isUserScopeItem(item)?"成员 · "+userScopeName(item):item);},
      scopeUsers(){refreshTick.value;const me=this.user;if(!me)return [];if(this.permissions.scopeAll)return state.users.map(user=>user.name);const scope=this.permissions.scope||[];if(!scope.length)return [me.name];return state.users.filter(user=>user.name===me.name||scopeMatched(user,scope)).map(user=>user.name);},
      scopeSummary(){const me=this.user;if(!me)return "";if(this.permissions.scopeAll)return `已配置为「全部用户」：该用户在「用户管理」里可以看到全部 ${state.users.length} 名用户。`;if(!(this.permissions.scope||[]).length)return "未配置任何部门或成员：该用户在「用户管理」里只能看到自己。";return `已选择 ${manageScopeSummary({manageScope:this.permissions.scope})}：该用户在「用户管理」里可以看到范围内 ${this.scopeUsers.length} 名用户（含自己）。`;}
    },
    mounted(){this.pageHandler=event=>{if(event.detail?.page==="查看权限")refreshTick.value+=1;};window.addEventListener("portal:page-change",this.pageHandler);},
    beforeUnmount(){window.removeEventListener("portal:page-change",this.pageHandler);},
    methods:{ back(){bridge.setPage("用户管理");} }
  };
  window.permissionReadVueApi = mount("#permissionReadView", PermissionReadApp, "permission-read");
})();
