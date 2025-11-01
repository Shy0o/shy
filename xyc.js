/*
------------------------------------------
@Author: Auto Generated (Modified)
@Date: 2025.11.01
@Description: gbxyc签到脚本 - 固定Token版
------------------------------------------

重写配置：
[Script]
# 获取并保存token (只需执行一次)
http-request ^https:\/\/api\.alldragon\.com\/.* script-path=alldragon.js, requires-body=true, timeout=60, tag=AllDragon获取token

# 定时签到 (使用已保存的token)
cron "0 9 * * *" script-path=alldragon.js, timeout=60, tag=AllDragon签到

[MITM]
hostname = api.alldragon.com

使用说明：
1. 首次使用：打开小程序，脚本会自动捕获并保存Authorization
2. 之后使用：定时任务会自动使用已保存的Authorization进行签到
3. Token失效：重新打开小程序，脚本会自动更新Authorization

⚠️【免责声明】
------------------------------------------
1、此脚本仅用于学习研究，不保证其合法性、准确性、有效性，请根据情况自行判断，本人对此不承担任何保证责任。
2、由于此脚本仅用于学习研究，您必须在下载后 24 小时内将所有内容从您的计算机或手机或任何存储设备中完全删除，若违反规定引起任何事件本人对此均不负责。
3、请勿将此脚本用于任何商业或非法目的，若违反规定请自行对此负责。
4、此脚本涉及应用与本人无关，本人对因此引起的任何隐私泄漏或其他后果不承担任何责任。
5、本人对任何脚本引发的问题概不负责，包括但不限于由脚本错误引起的任何损失和损害。
6、如果任何单位或个人认为此脚本可能涉嫌侵犯其权利，应及时通知并提供身份证明，所有权证明，我们将在收到认证文件确认后删除此脚本。
7、所有直接或间接使用、查看此脚本的人均应该仔细阅读此声明。本人保留随时更改或补充此声明的权利。一旦您使用或复制了此脚本，即视为您已接受此免责声明。
*/

const $ = new Env("GBxyc签到脚本");
const ckName = "alldragon_data";

// 用户多账号配置
$.userIdx = 0;
$.userList = [];
$.notifyMsg = [];

// notify
const notify = $.isNode() ? require('./sendNotify') : '';

// debug
$.is_debug = ($.isNode() ? process.env.IS_DEDUG : $.getdata('is_debug')) || 'false';

// 固定配置
const tenantId = "4200";
const tenantCode = "xycxmall";
const clientType = "3";

//------------------------------------------
// 检查环境，加载已保存的token
async function checkEnv() {
    try {
        // 从本地存储读取已保存的cookie数据
        let localData;
        if ($.isNode()) {
            // Node.js 环境
            localData = process.env[ckName] ? JSON.parse(process.env[ckName]) : [];
        } else {
            // Surge/Loon/QX 环境
            const data = $.getdata(ckName);
            localData = data ? JSON.parse(data) : [];
        }
        
        if (!localData || localData.length === 0) {
            $.msg($.name, `⚠️ 未找到已保存的Token`, `请先打开小程序，让脚本捕获Authorization`);
            throw new Error("未找到已保存的Token，请先获取Authorization");
        }
        
        $.log(`[INFO]成功加载 ${localData.length} 个账号的Token\n`);
        
        // 创建用户实例
        for (let i = 0; i < localData.length; i++) {
            const userData = localData[i];
            if (userData.authorization) {
                $.userList.push(new UserInfo(userData));
                $.log(`[INFO]加载账号${i + 1}: ${userData.userName} (手机号: ${userData.mobile || '未知'})\n`);
            }
        }
        
        if ($.userList.length === 0) {
            throw new Error("没有可用的账号，请重新获取Authorization");
        }
    } catch (e) {
        $.log(`[ERROR]checkEnv失败: ${e.message}\n`);
        throw e;
    }
}

//------------------------------------------
async function main() {
    $.log(`\n========== 开始执行签到任务 ==========\n`);
    
    // 并发执行所有用户
    for (let user of $.userList) {
        $.notifyMsg = [];
        $.title = "";
        
        try {
            $.log(`\n---------- 账号${user.index}: ${user.userName} ----------\n`);
            
            // 获取用户状态
            let userStatus = await user.getUserStatus();
            if (user.ckStatus && userStatus) {
                $.log(`[${user.userName}][INFO]查询用户状态成功\n`);
                
                if (userStatus.hasCheckinToday) {
                    $.title = "今日已签到";
                    DoubleLog(`✅ 「${userStatus.nickname}」今日已签到`);
                    DoubleLog(`📅 累计签到: ${userStatus.accumulateCheckDayNum}天`);
                    DoubleLog(`🔥 连续签到: ${userStatus.continueCheckDayNum}天`);
                } else {
                    // 执行签到
                    $.log(`[${user.userName}][INFO]开始执行签到...\n`);
                    let checkinResult = await user.checkin();
                    
                    if (checkinResult && checkinResult.success !== false) {
                        $.title = checkinResult.msg || "签到成功";
                        DoubleLog(`✅ 「${userStatus.nickname}」签到成功`);
                        DoubleLog(`🎁 获得积分: ${checkinResult.point || 0}`);
                        DoubleLog(`📅 累计签到: ${userStatus.accumulateCheckDayNum + 1}天`);
                        DoubleLog(`🔥 连续签到: ${userStatus.continueCheckDayNum + 1}天`);
                    } else {
                        $.title = "签到失败";
                        const failReason = checkinResult?.msg || checkinResult?.message || "未知原因";
                        DoubleLog(`❌ 「${userStatus.nickname}」签到失败`);
                        DoubleLog(`📋 失败原因: ${failReason}`);
                        // 如果有错误代码，也输出
                        if (checkinResult?.code) {
                            DoubleLog(`🔢 错误代码: ${checkinResult.code}`);
                        }
                    }
                }
            } else {
                const errorMsg = user.lastError || "Token失效或网络错误";
                DoubleLog(`⛔️ 「${user.userName ?? `账号${user.index}`}」Token验证失败`);
                DoubleLog(`📋 错误信息: ${errorMsg}`);
                DoubleLog(`💡 提示: 请重新打开小程序更新Token`);
            }
            
            // notify
            await sendMsg($.notifyMsg.join("\n"));
        } catch (e) {
            DoubleLog(`[${user.userName ?? `账号${user.index}`}][ERROR]${e.message || e}`);
        }
    }
    
    $.log(`\n========== 签到任务执行完成 ==========\n`);
}

// 双重日志
function DoubleLog(data) {
    if ($.isNode()) {
        console.log(`${data}`);
        $.notifyMsg.push(`${data}`);
    } else {
        $.log(`${data}`);
        $.notifyMsg.push(`${data}`);
    }
}

// 发送消息
async function sendMsg(message) {
    if (!message) return;
    
    if ($.isNode()) {
        if (notify && notify.sendNotify) {
            await notify.sendNotify($.name, message);
        }
    } else {
        $.msg($.name, $.title || '', message);
    }
}

// 用户类
class UserInfo {
    constructor(user) {
        // 默认属性
        this.index = ++$.userIdx;
        this.authorization = user.authorization;  // 使用固定的authorization
        this.memberId = user.memberId || "";
        this.userName = user.userName || `账号${this.index}`;
        this.mobile = user.mobile || "";
        this.ckStatus = true;
        this.lastError = "";
        
        $.log(`[INFO]账号${this.index}使用固定Token: ${this.authorization.substring(0, 50)}...\n`);
        
        // 请求封装
        this.baseUrl = `https://api.alldragon.com`;
        this.headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept-Encoding': 'gzip,compress,br,deflate',
            'Host': 'api.alldragon.com',
            'Authorization': this.authorization,  // 固定使用保存的token
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.64(0x1800402d) NetType/WIFI Language/zh_HK',
            'Referer': 'https://servicewechat.com/wxef49bf6a5aaef56a/70/page-frame.html',
            'Connection': 'keep-alive',
        };
    }
    
    // 请求方法
    async fetch(o) {
        try {
            if (typeof o === 'string') o = { url: o };
            if (o?.url?.startsWith("/")) o.url = this.baseUrl + o.url;
            
            $.log(`[${this.userName}][REQUEST]${o.url}\n`);
            
            // 构建请求参数
            let options = {
                url: o.url,
                headers: o.headers || this.headers
            };
            
            // 处理POST请求体
            if (o.type && o.type.toLowerCase() === 'post') {
                if (o.dataType === 'form' && o.body) {
                    // 将body对象转换为表单格式
                    let formData = [];
                    for (let key in o.body) {
                        formData.push(`${encodeURIComponent(key)}=${encodeURIComponent(o.body[key])}`);
                    }
                    options.body = formData.join('&');
                }
            }
            
            // 发起请求
            const res = await this.httpRequest(options);
            
            $.log(`[${this.userName}][RESPONSE]code: ${res?.code}, msg: ${res?.msg}\n`);
            
            // 详细的错误处理
            if (res?.code !== 200) {
                this.lastError = res?.msg || res?.message || `请求失败(code: ${res?.code})`;
                throw new Error(this.lastError);
            }
            return res;
        } catch (e) {
            this.ckStatus = false;
            this.lastError = e.message || e;
            $.log(`[${this.userName}][ERROR]请求失败: ${this.lastError}\n`);
            throw e;
        }
    }
    
    // HTTP请求封装
    async httpRequest(options) {
        return new Promise((resolve, reject) => {
            if ($.isNode()) {
                // Node.js环境使用axios或request
                reject(new Error("Node.js环境暂不支持，请使用Surge/Loon/QX"));
            } else {
                // Surge/Loon/QX环境
                const method = options.body ? 'POST' : 'GET';
                $.http[method.toLowerCase()](options).then(response => {
                    try {
                        const data = JSON.parse(response.body);
                        resolve(data);
                    } catch (e) {
                        reject(new Error(`解析响应失败: ${e.message}`));
                    }
                }).catch(err => {
                    reject(err);
                });
            }
        });
    }
    
    // 获取当前时间(YYYY-MM格式)
    getCurrentMonth() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    }
    
    // 获取用户签到状态
    async getUserStatus() {
        try {
            const opts = {
                url: "/mkt2/checkin/getUserStatus.json",
                type: "post",
                body: {
                    startTime: this.getCurrentMonth(),
                    tenantId: tenantId,
                    tenantCode: tenantCode,
                    clientType: clientType
                },
                dataType: "form"
            }
            let res = await this.fetch(opts);
            return res?.data;
        } catch (e) {
            this.ckStatus = false;
            this.lastError = `获取用户状态失败: ${e.message || e}`;
            $.log(`[${this.userName}][ERROR]${this.lastError}\n`);
            return null;
        }
    }
    
    // 每日签到
    async checkin() {
        try {
            const opts = {
                url: "/mkt2/checkin/doCheckin.json",
                type: "post",
                body: {
                    tenantId: tenantId,
                    tenantCode: tenantCode,
                    clientType: clientType
                },
                dataType: "form"
            }
            let res = await this.fetch(opts);
            $.log(`[${this.userName}][INFO]签到响应: ${res?.msg || '无消息'}\n`);
            
            // 返回完整的响应数据，包括可能的错误信息
            return {
                success: res?.code === 200,
                msg: res?.msg,
                code: res?.code,
                data: res?.data,
                point: res?.data?.point
            };
        } catch (e) {
            this.ckStatus = false;
            this.lastError = `签到失败: ${e.message || e}`;
            $.log(`[${this.userName}][ERROR]${this.lastError}\n`);
            return {
                success: false,
                msg: this.lastError,
                code: 'ERROR'
            };
        }
    }
}

// 对象键转小写
function ObjectKeys2LowerCase(obj) {
    if (!obj) return obj;
    let newObj = {};
    for (let key in obj) {
        newObj[key.toLowerCase()] = obj[key];
    }
    return newObj;
}

// Base64解码（兼容性处理）
function atob(str) {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(str, 'base64').toString('binary');
    } else if (typeof window !== 'undefined' && window.atob) {
        return window.atob(str);
    } else {
        // 简单实现
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        let output = '';
        str = str.replace(/[^A-Za-z0-9\+\/\=]/g, '');
        
        for (let i = 0; i < str.length;) {
            const enc1 = chars.indexOf(str.charAt(i++));
            const enc2 = chars.indexOf(str.charAt(i++));
            const enc3 = chars.indexOf(str.charAt(i++));
            const enc4 = chars.indexOf(str.charAt(i++));
            
            const chr1 = (enc1 << 2) | (enc2 >> 4);
            const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
            const chr3 = ((enc3 & 3) << 6) | enc4;
            
            output += String.fromCharCode(chr1);
            if (enc3 !== 64) output += String.fromCharCode(chr2);
            if (enc4 !== 64) output += String.fromCharCode(chr3);
        }
        return output;
    }
}

// 获取并保存Cookie
async function getCookie() {
    try {
        if (!$request) {
            $.log(`[WARN]未检测到请求对象\n`);
            return;
        }
        
        if ($request.method === 'OPTIONS') {
            $.log(`[INFO]OPTIONS请求，跳过\n`);
            return;
        }
        
        $.log(`[INFO]捕获到请求: ${$request.url}\n`);
        
        const header = ObjectKeys2LowerCase($request.headers);
        if (!header) {
            $.log(`[WARN]请求头为空\n`);
            return;
        }
        
        let authorization = header.authorization;
        
        if (!authorization) {
            $.log(`[WARN]未找到Authorization，跳过保存\n`);
            return;
        }
        
        $.log(`[INFO]成功捕获Authorization: ${authorization.substring(0, 50)}...\n`);
        
        // 解析JWT token获取用户信息
        let memberId = "";
        let mobile = "";
        let openId = "";
        
        try {
            const tokenParts = authorization.split('.');
            if (tokenParts.length === 3) {
                const payload = JSON.parse(atob(tokenParts[1]));
                memberId = payload.memberId || "";
                mobile = payload.mobile || "";
                openId = payload.openId || "";
                
                $.log(`[INFO]解析Token成功:\n`);
                $.log(`  - memberId: ${memberId}\n`);
                $.log(`  - mobile: ${mobile}\n`);
                $.log(`  - openId: ${openId}\n`);
            }
        } catch (e) {
            $.log(`[WARN]解析Token失败: ${e.message}\n`);
        }
        
        // 构建用户数据
        const newData = {
            "memberId": memberId,
            "mobile": mobile,
            "authorization": authorization,  // 保存完整的authorization
            "userName": mobile ? `手机${mobile.slice(-4)}` : (memberId ? `用户${memberId.slice(-4)}` : "新用户"),
            "updateTime": new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})
        };
        
        // 读取现有数据
        let localData;
        if ($.isNode()) {
            localData = process.env[ckName] ? JSON.parse(process.env[ckName]) : [];
        } else {
            const data = $.getdata(ckName);
            localData = data ? JSON.parse(data) : [];
        }
        
        // 查找是否已存在该用户
        const index = localData.findIndex(e => e.memberId === newData.memberId);
        
        if (index !== -1) {
            // 更新现有用户
            localData[index] = newData;
            if ($.isNode()) {
                // Node.js环境需要手动设置环境变量
                process.env[ckName] = JSON.stringify(localData);
            } else {
                $.setdata(JSON.stringify(localData), ckName);
            }
            $.msg(
                $.name, 
                `🔄 ${newData.userName} Token更新成功!`, 
                `手机号: ${mobile || '未知'}\n会员ID: ${memberId}\n更新时间: ${newData.updateTime}\n\n✅ Token已保存，可进行自动签到`
            );
            $.log(`[SUCCESS]更新账号Token: ${newData.userName}\n`);
        } else {
            // 添加新用户
            localData.push(newData);
            if ($.isNode()) {
                process.env[ckName] = JSON.stringify(localData);
            } else {
                $.setdata(JSON.stringify(localData), ckName);
            }
            $.msg(
                $.name, 
                `🎉 ${newData.userName} 添加成功!`, 
                `手机号: ${mobile || '未知'}\n会员ID: ${memberId}\n添加时间: ${newData.updateTime}\n\n✅ Token已保存，可进行自动签到`
            );
            $.log(`[SUCCESS]新增账号Token: ${newData.userName}\n`);
        }
        
        $.log(`[INFO]当前共保存 ${localData.length} 个账号\n`);
        
    } catch (e) {
        $.msg($.name, `⛔️ 保存Token失败!`, e.message || e);
        $.log(`[ERROR]保存Token失败: ${e.message || e}\n`);
    }
}

// Debug函数
function debug(response, title = 'debug') {
    if ($.is_debug === 'true') {
        $.log(`\n============== ${title} ==============\n`);
        $.log(typeof response === 'object' ? JSON.stringify(response, null, 2) : response);
        $.log(`\n======================================\n`);
    }
}

// 主程序执行入口
!(async () => {
    try {
        if (typeof $request !== "undefined") {
            // 抓包模式：保存Authorization
            $.log(`[INFO]运行模式: 抓包保存Token\n`);
            await getCookie();
        } else {
            // 定时任务模式：使用已保存的Authorization进行签到
            $.log(`[INFO]运行模式: 定时签到\n`);
            await checkEnv();
            await main();
        }
    } catch (e) {
        $.logErr(e);
        $.msg($.name, `⛔️ 脚本运行错误`, e.message || e);
    }
})()
    .catch((e) => { 
        $.logErr(e);
        $.msg($.name, `⛔️ script run error!`, e.message || e);
    })
    .finally(async () => {
        $.done({ ok: 1 });
    });

/** ---------------------------------固定不动区域----------------------------------------- */
//prettier-ignore
async function sendMsg(a) { a && ($.isNode() ? await notify.sendNotify($.name, a) : $.msg($.name, $.title || "", a, { "media-url": $.avatar })) }
function DoubleLog(o) { o && ($.log(`${o}`), $.notifyMsg.push(`${o}`)) };
async function checkEnv() { try { if (!userCookie?.length) throw new Error("no available accounts found"); $.log(`\n[INFO]检测到 ${userCookie?.length ?? 0} 个账号\n`), $.userList.push(...userCookie.map((o => new UserInfo(o))).filter(Boolean)) } catch (o) { throw o } }
function debug(g, e = "debug") { "true" === $.is_debug && ($.log(`\n-----------${e}------------\n`), $.log("string" == typeof g ? g : $.toStr(g) || `debug error => t=${g}`), $.log(`\n-----------${e}------------\n`)) }
//From xream's ObjectKeys2LowerCase
function ObjectKeys2LowerCase(obj) { return !obj ? {} : Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v])) };
//From sliverkiss's Request
async function Request(t) { "string" == typeof t && (t = { url: t }); try { if (!t?.url) throw new Error("[URL][ERROR]缺少 url 参数"); let { url: o, type: e, headers: r = {}, body: s, params: a, dataType: n = "form", resultType: u = "data" } = t; const p = e ? e?.toLowerCase() : "body" in t ? "post" : "get", c = o.concat("post" === p ? "?" + $.queryStr(a) : ""), i = t.timeout ? $.isSurge() ? t.timeout / 1e3 : t.timeout : 1e4; "json" === n && (r["Content-Type"] = "application/json;charset=UTF-8"); const y = s && "form" == n ? $.queryStr(s) : $.toStr(s), l = { ...t, ...t?.opts ? t.opts : {}, url: c, headers: r, ..."post" === p && { body: y }, ..."get" === p && a && { params: a }, timeout: i }, m = $.http[p.toLowerCase()](l).then((t => "data" == u ? $.toObj(t.body) || t.body : $.toObj(t) || t)).catch((t => $.log(`[${p.toUpperCase()}][ERROR]${t}\n`))); return Promise.race([new Promise(((t, o) => setTimeout((() => o("当前请求已超时")), i))), m]) } catch (t) { console.log(`[${p.toUpperCase()}][ERROR]${t}\n`) } }
//From chavyleung's Env.js
function Env(t, e) { class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; return "POST" === e && (s = this.post), new Promise(((e, r) => { s.call(this, t, ((t, s, a) => { t ? r(t) : e(s) })) })) } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } } return new class { constructor(t, e) { this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.encoding = "utf-8", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) } getEnv() { return "undefined" != typeof $environment && $environment["surge-version"] ? "Surge" : "undefined" != typeof $environment && $environment["stash-version"] ? "Stash" : "undefined" != typeof module && module.exports ? "Node.js" : "undefined" != typeof $task ? "Quantumult X" : "undefined" != typeof $loon ? "Loon" : "undefined" != typeof $rocket ? "Shadowrocket" : void 0 } isNode() { return "Node.js" === this.getEnv() } isQuanX() { return "Quantumult X" === this.getEnv() } isSurge() { return "Surge" === this.getEnv() } isLoon() { return "Loon" === this.getEnv() } isShadowrocket() { return "Shadowrocket" === this.getEnv() } isStash() { return "Stash" === this.getEnv() } toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } } toStr(t, e = null) { try { return JSON.stringify(t) } catch { return e } } getjson(t, e) { let s = e; if (this.getdata(t)) try { s = JSON.parse(this.getdata(t)) } catch { } return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } } getScript(t) { return new Promise((e => { this.get({ url: t }, ((t, s, r) => e(r))) })) } runScript(t, e) { return new Promise((s => { let r = this.getdata("@chavy_boxjs_userCfgs.httpapi"); r = r ? r.replace(/\n/g, "").trim() : r; let a = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); a = a ? 1 * a : 20, a = e && e.timeout ? e.timeout : a; const [i, o] = r.split("@"), n = { url: `http://${o}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: a }, headers: { "X-Key": i, Accept: "*/*" }, timeout: a }; this.post(n, ((t, e, r) => s(r))) })).catch((t => this.logErr(t))) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), r = !s && this.fs.existsSync(e); if (!s && !r) return {}; { const r = s ? t : e; try { return JSON.parse(this.fs.readFileSync(r)) } catch (t) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), r = !s && this.fs.existsSync(e), a = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, a) : r ? this.fs.writeFileSync(e, a) : this.fs.writeFileSync(t, a) } } lodash_get(t, e, s = void 0) { const r = e.replace(/\[(\d+)\]/g, ".$1").split("."); let a = t; for (const t of r) if (a = Object(a)[t], void 0 === a) return s; return a } lodash_set(t, e, s) { return Object(t) !== t || (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce(((t, s, r) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[r + 1]) >> 0 == +e[r + 1] ? [] : {}), t)[e[e.length - 1]] = s), t } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, r] = /^@(.*?)\.(.*?)$/.exec(t), a = s ? this.getval(s) : ""; if (a) try { const t = JSON.parse(a); e = t ? this.lodash_get(t, r, "") : e } catch (t) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, r, a] = /^@(.*?)\.(.*?)$/.exec(e), i = this.getval(r), o = r ? "null" === i ? null : i || "{}" : "{}"; try { const e = JSON.parse(o); this.lodash_set(e, a, t), s = this.setval(JSON.stringify(e), r) } catch (e) { const i = {}; this.lodash_set(i, a, t), s = this.setval(JSON.stringify(i), r) } } else s = this.setval(t, e); return s } getval(t) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.read(t); case "Quantumult X": return $prefs.valueForKey(t); case "Node.js": return this.data = this.loaddata(), this.data[t]; default: return this.data && this.data[t] || null } } setval(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.write(t, e); case "Quantumult X": return $prefs.setValueForKey(t, e); case "Node.js": return this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0; default: return this.data && this.data[e] || null } } initGotEnv(t) { this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar)) } get(t, e = (() => { })) { switch (t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"], delete t.headers["content-type"], delete t.headers["content-length"]), t.params && (t.url += "?" + this.queryStr(t.params)), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, ((t, s, r) => { !t && s && (s.body = r, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, r) })); break; case "Quantumult X": this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: r, headers: a, body: i, bodyBytes: o } = t; e(null, { status: s, statusCode: r, headers: a, body: i, bodyBytes: o }, i, o) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let s = require("iconv-lite"); this.initGotEnv(t), this.got(t).on("redirect", ((t, e) => { try { if (t.headers["set-cookie"]) { const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString(); s && this.ckjar.setCookieSync(s, null), e.cookieJar = this.ckjar } } catch (t) { this.logErr(t) } })).then((t => { const { statusCode: r, statusCode: a, headers: i, rawBody: o } = t, n = s.decode(o, this.encoding); e(null, { status: r, statusCode: a, headers: i, rawBody: o, body: n }, n) }), (t => { const { message: r, response: a } = t; e(r, a, a && s.decode(a.rawBody, this.encoding)) })) } } post(t, e = (() => { })) { const s = t.method ? t.method.toLocaleLowerCase() : "post"; switch (t.body && t.headers && !t.headers["Content-Type"] && !t.headers["content-type"] && (t.headers["content-type"] = "application/x-www-form-urlencoded"), t.headers && (delete t.headers["Content-Length"], delete t.headers["content-length"]), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient[s](t, ((t, s, r) => { !t && s && (s.body = r, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, r) })); break; case "Quantumult X": t.method = s, this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: r, headers: a, body: i, bodyBytes: o } = t; e(null, { status: s, statusCode: r, headers: a, body: i, bodyBytes: o }, i, o) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let r = require("iconv-lite"); this.initGotEnv(t); const { url: a, ...i } = t; this.got[s](a, i).then((t => { const { statusCode: s, statusCode: a, headers: i, rawBody: o } = t, n = r.decode(o, this.encoding); e(null, { status: s, statusCode: a, headers: i, rawBody: o, body: n }, n) }), (t => { const { message: s, response: a } = t; e(s, a, a && r.decode(a.rawBody, this.encoding)) })) } } time(t, e = null) { const s = e ? new Date(e) : new Date; let r = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in r) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? r[e] : ("00" + r[e]).substr(("" + r[e]).length))); return t } queryStr(t) { let e = ""; for (const s in t) { let r = t[s]; null != r && "" !== r && ("object" == typeof r && (r = JSON.stringify(r)), e += `${s}=${r}&`) } return e = e.substring(0, e.length - 1), e } msg(e = t, s = "", r = "", a) { const i = t => { switch (typeof t) { case void 0: return t; case "string": switch (this.getEnv()) { case "Surge": case "Stash": default: return { url: t }; case "Loon": case "Shadowrocket": return t; case "Quantumult X": return { "open-url": t }; case "Node.js": return }case "object": switch (this.getEnv()) { case "Surge": case "Stash": case "Shadowrocket": default: return { url: t.url || t.openUrl || t["open-url"] }; case "Loon": return { openUrl: t.openUrl || t.url || t["open-url"], mediaUrl: t.mediaUrl || t["media-url"] }; case "Quantumult X": return { "open-url": t["open-url"] || t.url || t.openUrl, "media-url": t["media-url"] || t.mediaUrl, "update-pasteboard": t["update-pasteboard"] || t.updatePasteboard }; case "Node.js": return }default: return } }; if (!this.isMute) switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: $notification.post(e, s, r, i(a)); break; case "Quantumult X": $notify(e, s, r, i(a)); case "Node.js": }if (!this.isMuteLog) { let t = ["", "==============📣系统通知📣=============="]; t.push(e), s && t.push(s), r && t.push(r), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.join(this.logSeparator)) } logErr(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: this.log("", `❗️${this.name}, 错误!`, t); break; case "Node.js": this.log("", `❗️${this.name}, 错误!`, t.stack) } } wait(t) { return new Promise((e => setTimeout(e, t))) } done(t = {}) { const e = ((new Date).getTime() - this.startTime) / 1e3; switch (this.log("", `🔔${this.name}, 结束! 🕛 ${e} 秒`), this.log(), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: $done(t); break; case "Node.js": process.exit(1) } } }(t, e) }
