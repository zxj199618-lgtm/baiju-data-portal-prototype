/**
 * 页面：user-management
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    bridge,
    loginUser,
    manageScopeOf,
    mount,
    notify,
    paginate,
    refreshTick,
    scopeMatched,
    state
  } = window.PortalVue;


  function userInManageScope(manager, user) {
    if (!manager || !user) return true;
    if (user.name === manager.name) return true;
    if (manager.manageScopeAll) return true;
    const scope = manageScopeOf(manager);
    if (!scope.length) return false;
    return scopeMatched(user, scope);
  }

  function visibleUsersFor(manager) {
    return state.users.filter(user => userInManageScope(manager, user));
  }

  const UserManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <div class="portal-vue-user-layout">
          <aside class="portal-vue-user-groups"><button v-for="item in groupOptions" :key="item.name" class="portal-vue-user-group" :class="{active:item.name===group}" type="button" @click="selectGroup(item.name)"><span>{{ item.name }}</span><span>{{ item.count }}</span></button></aside>
          <section class="portal-vue-user-main">
            <div class="portal-vue-toolbar"><div class="portal-vue-toolbar-left"><el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索姓名、邮箱、部门" @input="page=1"></el-input><el-select v-model="status" class="portal-vue-filter" @change="page=1"><el-option label="全部状态" value="全部状态"></el-option><el-option label="启用中" value="启用中"></el-option><el-option label="已停用" value="已停用"></el-option></el-select></div></div>
            <el-table :data="pagedRows" class="portal-vue-table" border empty-text="暂无用户">
              <el-table-column label="用户" width="140" fixed="left"><template #default="scope"><div class="portal-vue-user-cell"><el-avatar :size="30">{{ scope.row.name.slice(0,1) }}</el-avatar><span class="portal-vue-name">{{ scope.row.name }}</span></div></template></el-table-column>
              <el-table-column prop="dept" label="部门组织" min-width="220" show-overflow-tooltip></el-table-column>
              <el-table-column prop="role" label="岗位角色" width="130"></el-table-column>
              <el-table-column prop="email" label="邮箱" width="210" show-overflow-tooltip></el-table-column>
              <el-table-column label="所属权限组" width="130"><template #default="scope"><el-tag :type="scope.row.group==='未分配'?'warning':'primary'" effect="light">{{ scope.row.group }}</el-tag></template></el-table-column>
              <el-table-column label="账号状态" width="100"><template #default="scope"><el-tag :type="scope.row.status==='已停用'?'info':'success'" effect="plain">{{ scope.row.status==='已停用'?'已停用':'启用中' }}</el-tag></template></el-table-column>
              <el-table-column prop="login" label="最近登录" width="170"></el-table-column>
              <el-table-column label="操作" width="236" fixed="right"><template #default="scope"><div class="portal-vue-actions"><el-button link type="primary" @click="openView(scope.row)">查看权限</el-button><el-button v-if="canEdit('用户管理')" link type="primary" @click="openAssign(scope.row)">设置权限组</el-button><el-button v-if="canEdit('用户管理')" link type="primary" @click="openPermission(scope.row)">配置权限</el-button></div></template></el-table-column>
            </el-table>
            <div class="portal-vue-pagination"><span>共 {{ filteredRows.length }} 条，当前 {{ rangeText }}</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="filteredRows.length" layout="sizes, prev, pager, next"></el-pagination></div>
          </section>
        </div>
        <el-dialog v-model="assignVisible" :title="assignUser ? assignUser.name + ' · 设置权限组' : '设置权限组'" width="520px"><div v-if="assignUser" class="portal-vue-detail-grid"><div class="portal-vue-detail-item"><span>部门组织</span><strong>{{ assignUser.dept }}</strong></div><div class="portal-vue-detail-item"><span>岗位角色</span><strong>{{ assignUser.role }}</strong></div></div><el-form label-position="top" class="portal-vue-dialog-form"><el-form-item label="选择权限组"><el-select v-model="assignGroup"><el-option label="未分配" value="未分配"></el-option><el-option v-for="item in state.groups" :key="item.name" :label="item.name" :value="item.name"></el-option></el-select></el-form-item></el-form><template #footer><el-button @click="assignVisible=false">取消</el-button><el-button v-if="canEdit('用户管理')" type="primary" @click="saveAssign">保存权限组</el-button></template></el-dialog>
      </el-config-provider>
    `,
    data:()=>({keyword:"",status:"全部状态",group:"全部权限组",page:1,pageSize:10,assignVisible:false,assignUser:null,assignGroup:"",state}),
    computed:{
      currentUser(){refreshTick.value;return loginUser();},
      visibleUsers(){refreshTick.value;return visibleUsersFor(this.currentUser);},
      groupOptions(){refreshTick.value;const users=this.visibleUsers;return ["全部权限组","未分配",...state.groups.map(item=>item.name)].map(name=>({name,count:name==="全部权限组"?users.length:users.filter(user=>user.group===name).length}));},
      filteredRows(){refreshTick.value;const keyword=this.keyword.trim().toLowerCase();return this.visibleUsers.filter(user=>(this.group==="全部权限组"||user.group===this.group)&&(this.status==="全部状态"||(this.status==="已停用"?user.status==="已停用":user.status!=="已停用"))&&(!keyword||`${user.name} ${user.email} ${user.dept} ${user.role}`.toLowerCase().includes(keyword)));},
      pagedRows(){const result=paginate(this.filteredRows,this.page,this.pageSize);if(result.safePage!==this.page)this.page=result.safePage;return result.rows;},
      rangeText(){if(!this.filteredRows.length)return "0-0";return `${(this.page-1)*this.pageSize+1}-${Math.min(this.page*this.pageSize,this.filteredRows.length)}`;}
    },
    methods:{
      openView(user){bridge.setActiveUserIndex(state.users.indexOf(user));bridge.setPage("查看权限");},
      selectGroup(name){this.group=name;this.page=1;},openAssign(user){this.assignUser=user;this.assignGroup=user.group;this.assignVisible=true;},saveAssign(){this.assignUser.group=this.assignGroup;this.assignVisible=false;notify(`${this.assignUser.name} 已分配到「${this.assignGroup}」`);},openPermission(user){bridge.setActiveUserIndex(state.users.indexOf(user));bridge.setPage("配置权限");}
    }
  };
  window.userManagementVueApi = mount("#userManagementView", UserManagementApp, "user-management");
})();
