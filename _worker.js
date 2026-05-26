

export default {
    async fetch(request, env, ctx) {
        const 面板管理员账号 = env.USER || env.user || env.USERNAME || env.username || 'admin';
        const 面板管理员密码 = env.ADMIN || env.admin || env.PASSWORD || env.password || env.pswd;
        const 演示样板 = env.DEMO ? true : false;
        if (!面板管理员密码) {
            return new Response('请先在变量中设置 PASSWORD 变量', { status: 500 });
        }

        if (env.KV && typeof env.KV.get === 'function') {
            const url = new URL(request.url);
            const UA = request.headers.get('User-Agent') || 'null';
            const 访问路径 = url.pathname.slice(1).toLowerCase();
            const 区分大小写访问路径 = url.pathname.slice(1);

            const 管理员TOKEN = await MD5MD5(面板管理员密码 + 面板管理员账号);
            const 临时TOKEN = await MD5MD5(url.hostname + 管理员TOKEN + UA);
            const 管理员COOKIE = await MD5MD5(管理员TOKEN + UA);

            // 验证管理员Cookie的函数
            const 验证管理员Cookie = () => {
                const cookies = request.headers.get('Cookie') || '';
                const cookieMatch = cookies.match(/admin_token=([^;]+)/);
                return cookieMatch && cookieMatch[1] === 管理员COOKIE;
            };

            if (访问路径 == 'usage.json') {// 请求数使用数据接口 Usage.json
                let usage_json = 创建默认Usage(false);
                if (url.searchParams.get('token') === 临时TOKEN || url.searchParams.get('token') === 管理员TOKEN) {
                    const 当前时间 = Date.now();
                    const 已保存Usage = await env.KV.get('usage.json', { type: 'json' });
                    const 已保存更新时间 = Number(已保存Usage?.UpdateTime || 0) || 0;
                    usage_json = 补全Usage结构(已保存Usage || {});
                    usage_json.success = true;
                    usage_json.total = (usage_json.pages || 0) + (usage_json.workers || 0);
                    usage_json.msg = '✅ 成功加载免费额度使用数据';
                    if (!已保存更新时间 || (当前时间 - 已保存更新时间) > 获取单账号查询间隔毫秒(env)) {
                        if (已保存更新时间 && ctx && typeof ctx.waitUntil === 'function') {
                            usage_json.stale = true;
                            usage_json.refreshing = true;
                            usage_json.msg = '✅ 成功加载缓存数据，后台刷新中';
                            ctx.waitUntil(后台更新请求数(env).catch(error => console.error('后台刷新使用数据失败:', error.message)));
                        } else {
                            usage_json = await 更新请求数(env);
                        }
                    }
                }
                return new Response(JSON.stringify(usage_json, null, 2), { headers: { 'Content-Type': 'application/json;charset=UTF-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
            } else if (访问路径 == 'admin' || 访问路径.startsWith('admin/')) {// 管理员面板
                // 管理面板 - 验证Cookie
                if (验证管理员Cookie()) {
                    if (区分大小写访问路径 === 'admin/config.json') {
                        const usage_config_json = await env.KV.get('usage_config.json', { type: 'json' }) || [];
                        const masked_config_json = usage_config_json.map(item => {
                            const updateTime = 获取账号最后更新时间(item);
                            return {
                                ...item,
                                UpdateTime: updateTime || item.UpdateTime,
                                Usage: 补全账号Usage结构(item),
                                GlobalAPIKey: item.GlobalAPIKey ? 掩码敏感信息(item.GlobalAPIKey) : null,
                                APIToken: item.APIToken ? 掩码敏感信息(item.APIToken) : null
                            };
                        });
                        return new Response(JSON.stringify(masked_config_json, null, 2), { status: 200, headers: { 'Content-Type': 'application/json;charset=UTF-8' } });
                    } else if (区分大小写访问路径 === 'admin/usage.json') {
                        const usage_json = await 更新请求数(env, { force: url.searchParams.get('force') === '1' });
                        return new Response(JSON.stringify(usage_json, null, 2), { headers: { 'Content-Type': 'application/json;charset=UTF-8' } });
                    }

                    return UsagePanel管理面板(管理员TOKEN);
                } else return new Response(null, { status: 302, headers: { 'Location': '/' } });

            } else if (区分大小写访问路径.startsWith('api/')) {// API接口
                if (区分大小写访问路径 === 'api/login') { // 管理员登录接口
                    if (request.method !== 'POST') {
                        return new Response(JSON.stringify({ success: false, msg: 'Method Not Allowed' }), { status: 405, headers: { 'Content-Type': 'application/json;charset=UTF-8' } });
                    }
                    try {
                        const body = await request.json();
                        const 输入账号 = body.username || '';
                        const 输入密码 = body.password || '';
                        if (输入账号 === 面板管理员账号 && 输入密码 === 面板管理员密码) {
                            // 账号密码正确，设置Cookie
                            return new Response(JSON.stringify({ success: true, msg: '登录成功' }), {
                                status: 200,
                                headers: {
                                    'Content-Type': 'application/json;charset=UTF-8',
                                    'Set-Cookie': `admin_token=${管理员COOKIE}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`
                                }
                            });
                        } else {
                            return new Response(JSON.stringify({ success: false, msg: '账号或密码错误' }), {
                                status: 401,
                                headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                            });
                        }
                    } catch (e) {
                        return new Response(JSON.stringify({ success: false, msg: '请求格式错误' }), {
                            status: 400,
                            headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                        });
                    }
                }

                if (request.method !== 'POST') {
                    return new Response(JSON.stringify({ success: false, msg: 'Method Not Allowed' }), { status: 405, headers: { 'Content-Type': 'application/json;charset=UTF-8' } });
                }
                if (!验证管理员Cookie()) return new Response(null, { status: 302, headers: { 'Location': '/' } });

                if (区分大小写访问路径 === 'api/logout') {// 登出接口
                    return new Response(JSON.stringify({ success: true, msg: '登出成功' }), {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/json;charset=UTF-8',
                            'Set-Cookie': `admin_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
                        }
                    });
                } else if (区分大小写访问路径 === 'api/add' && !演示样板) {// 增加CF账号
                    try {
                        const newConfig = await request.json();

                        // 验证配置完整性：需要 (Email + GlobalAPIKey) 或 (AccountID + APIToken)
                        const hasEmailAuth = newConfig.Email && newConfig.GlobalAPIKey;
                        const hasTokenAuth = newConfig.AccountID && newConfig.APIToken;

                        if (!hasEmailAuth && !hasTokenAuth) {
                            return new Response(JSON.stringify({ success: false, msg: '配置不完整，需要提供 Email+GlobalAPIKey 或 AccountID+APIToken' }), { status: 400, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
                        }

                        const now = Date.now();
                        const CF_JSON = {
                            ID: 0,
                            Name: newConfig.Name || '未命名账号',
                            Email: hasEmailAuth ? newConfig.Email : null,
                            GlobalAPIKey: hasEmailAuth ? newConfig.GlobalAPIKey : null,
                            AccountID: newConfig.AccountID || null,
                            APIToken: hasTokenAuth ? newConfig.APIToken : null,
                            UpdateTime: now,
                            LastCheckTime: now,
                            Usage: 创建默认Usage(false)
                        };

                        // 验证 API 信息是否有效
                        const usage_result = await getCloudflareUsage(CF_JSON.Email, CF_JSON.GlobalAPIKey, CF_JSON.AccountID, CF_JSON.APIToken);
                        if (!usage_result.success) {
                            return new Response(JSON.stringify({ success: false, msg: '无法验证该CF账号的API信息' }), { status: 400, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
                        }

                        CF_JSON.UpdateTime = Date.now();
                        CF_JSON.LastCheckTime = CF_JSON.UpdateTime;
                        CF_JSON.Usage = 补全账号Usage结构({ ...CF_JSON, Usage: usage_result });

                        // 读取现有配置
                        let usage_config_json = await env.KV.get('usage_config.json', { type: 'json' });
                        if (!Array.isArray(usage_config_json)) {
                            usage_config_json = [];
                        }

                        // 验证账号是否已存在 (通过 Email 或 AccountID 判断)
                        const existingIndex = usage_config_json.findIndex(item =>
                            (CF_JSON.Email && item.Email && item.Email.toLowerCase() === CF_JSON.Email.toLowerCase()) ||
                            (CF_JSON.AccountID && item.AccountID && item.AccountID === CF_JSON.AccountID)
                        );

                        if (existingIndex !== -1) {
                            // 账号已存在，更新现有账号信息
                            const existingAccount = usage_config_json[existingIndex];
                            CF_JSON.ID = existingAccount.ID; // 保留原有 ID
                            usage_config_json[existingIndex] = CF_JSON;
                            await env.KV.put('usage_config.json', JSON.stringify(usage_config_json));

                            return new Response(JSON.stringify({ success: true, msg: '账号已存在，已更新账号信息', data: { ID: CF_JSON.ID, Name: CF_JSON.Name } }), { status: 200, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
                        }

                        // 生成新 ID：现有最大 ID + 1，如果为空则从 1 开始
                        CF_JSON.ID = usage_config_json.length > 0
                            ? Math.max(...usage_config_json.map(item => item.ID || 0)) + 1
                            : 1;

                        // 添加到配置数组中并保存到 KV
                        usage_config_json.push(CF_JSON);
                        await env.KV.put('usage_config.json', JSON.stringify(usage_config_json));

                        return new Response(JSON.stringify({ success: true, msg: '账号添加成功', data: { ID: CF_JSON.ID, Name: CF_JSON.Name } }), { status: 200, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
                    } catch (error) {
                        console.error('保存配置失败:', error);
                        return new Response(JSON.stringify({ success: false, msg: '保存配置失败: ' + error.message }), { status: 500, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
                    }

                } else if (区分大小写访问路径 === 'api/del' && !演示样板) {// 删除CF账号
                    try {
                        const body = await request.json();
                        const deleteId = body.ID;

                        // 验证 ID 参数
                        if (deleteId === undefined || deleteId === null) {
                            return new Response(JSON.stringify({ success: false, msg: '请提供要删除的账号ID' }), { status: 400, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
                        }

                        // 读取现有配置
                        let usage_config_json = await env.KV.get('usage_config.json', { type: 'json' });
                        if (!Array.isArray(usage_config_json) || usage_config_json.length === 0) {
                            return new Response(JSON.stringify({ success: false, msg: '配置列表为空，无法删除' }), { status: 404, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
                        }

                        // 查找要删除的账号
                        const targetIndex = usage_config_json.findIndex(item => item.ID === deleteId);
                        if (targetIndex === -1) {
                            return new Response(JSON.stringify({ success: false, msg: `未找到ID为 ${deleteId} 的账号` }), { status: 404, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
                        }

                        // 获取被删除账号的名称用于返回信息
                        const deletedName = usage_config_json[targetIndex].Name || '未命名账号';

                        // 删除该账号
                        usage_config_json.splice(targetIndex, 1);

                        // 保存回 KV
                        await env.KV.put('usage_config.json', JSON.stringify(usage_config_json));

                        return new Response(JSON.stringify({ success: true, msg: `账号 "${deletedName}" 已删除`, data: { ID: deleteId, Name: deletedName } }), { status: 200, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
                    } catch (error) {
                        console.error('删除账号失败:', error);
                        return new Response(JSON.stringify({ success: false, msg: '删除账号失败: ' + error.message }), { status: 500, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
                    }

                } else if (区分大小写访问路径 === 'api/check' && !演示样板) {// 检查单个CF账号请求量接口
                    try {
                        const Usage_JSON = await getCloudflareUsage(url.searchParams.get('Email'), url.searchParams.get('GlobalAPIKey'), url.searchParams.get('AccountID'), url.searchParams.get('APIToken'));
                        return new Response(JSON.stringify(Usage_JSON, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
                    } catch (err) {
                        const errorResponse = { msg: '查询请求量失败，失败原因：' + err.message, error: err.message };
                        return new Response(JSON.stringify(errorResponse, null, 2), { status: 500, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
                    }
                } else if (演示样板) {
                    return new Response(JSON.stringify({ success: false, msg: '预览模式下，无法进行此操作' }), { status: 403, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
                }
            } else if (访问路径 === 'robots.txt') {
                return new Response('User-agent: *\nDisallow: /', { status: 200, headers: { 'Content-Type': 'text/plain; charset=UTF-8' } });
            } else if (url.pathname === '/') {
                return UsagePanel主页(临时TOKEN);
            }

            return new Response('404 Not Found', { status: 404 });
        } else {
            return new Response('请先绑定一个KV命名空间到变量KV', { status: 500 });
        }
    },
    async scheduled(event, env, ctx) {
        // 定时执行请求数更新
        ctx.waitUntil((async () => {
            await 更新请求数(env);
        })());
    }
};

////////////////////////////////功能函数//////////////////////////////////
const 免费额度 = {
    requestsDaily: 100000,
    d1RowsReadDaily: 5000000,
    d1RowsWrittenDaily: 100000,
    d1StorageBytes: 5 * 1024 * 1024 * 1024,
    kvReadsDaily: 100000,
    kvWritesDaily: 1000,
    kvDeletesDaily: 1000,
    kvListsDaily: 1000,
    kvStorageBytes: 1 * 1024 * 1024 * 1024,
    r2ClassAMonthly: 1000000,
    r2ClassBMonthly: 10000000,
    r2StorageBytes: 10 * 1024 * 1024 * 1024
};

const 默认单账号查询间隔毫秒 = 20 * 60 * 1000;
const 默认每轮最多外部子请求数 = 50;

const R2_CLASS_A_ACTIONS = new Set([
    'listbuckets', 'putbucket', 'listobjects', 'listobjectsv2', 'putobject', 'copyobject',
    'completemultipartupload', 'createmultipartupload', 'lifecyclestoragetiertransition',
    'listmultipartuploads', 'uploadpart', 'uploadpartcopy', 'listparts',
    'putbucketencryption', 'putbucketcors', 'putbucketlifecycleconfiguration'
]);

const R2_CLASS_B_ACTIONS = new Set([
    'headbucket', 'headobject', 'getobject', 'usagesummary', 'getbucketencryption',
    'getbucketlocation', 'getbucketcors', 'getbucketlifecycleconfiguration'
]);

const R2_FREE_ACTIONS = new Set(['deleteobject', 'deleteobjects', 'deletebucket', 'abortmultipartupload']);

function 创建默认资源统计() {
    return {
        d1: {
            rowsRead: 0,
            rowsReadLimit: 免费额度.d1RowsReadDaily,
            rowsWritten: 0,
            rowsWrittenLimit: 免费额度.d1RowsWrittenDaily,
            readQueries: 0,
            writeQueries: 0,
            storageBytes: 0,
            storageLimitBytes: 免费额度.d1StorageBytes,
            databases: 0,
            period: 'day'
        },
        kv: {
            reads: 0,
            readsLimit: 免费额度.kvReadsDaily,
            writes: 0,
            writesLimit: 免费额度.kvWritesDaily,
            deletes: 0,
            deletesLimit: 免费额度.kvDeletesDaily,
            lists: 0,
            listsLimit: 免费额度.kvListsDaily,
            operations: 0,
            storageBytes: 0,
            storageLimitBytes: 免费额度.kvStorageBytes,
            keys: 0,
            namespaces: 0,
            period: 'day'
        },
        r2: {
            classA: 0,
            classALimit: 免费额度.r2ClassAMonthly,
            classB: 0,
            classBLimit: 免费额度.r2ClassBMonthly,
            free: 0,
            other: 0,
            operations: 0,
            storageBytes: 0,
            storageLimitBytes: 免费额度.r2StorageBytes,
            objects: 0,
            buckets: 0,
            period: 'month'
        }
    };
}

function 创建汇总资源统计() {
    const resources = 创建默认资源统计();
    resources.d1.rowsReadLimit = 0;
    resources.d1.rowsWrittenLimit = 0;
    resources.d1.storageLimitBytes = 0;
    resources.kv.readsLimit = 0;
    resources.kv.writesLimit = 0;
    resources.kv.deletesLimit = 0;
    resources.kv.listsLimit = 0;
    resources.kv.storageLimitBytes = 0;
    resources.r2.classALimit = 0;
    resources.r2.classBLimit = 0;
    resources.r2.storageLimitBytes = 0;
    return resources;
}

function 创建默认Usage(success = false, msg = '❌ 无效TOKEN') {
    return {
        success,
        pages: 0,
        workers: 0,
        total: 0,
        max: success ? 免费额度.requestsDaily : 0,
        resources: 创建默认资源统计(),
        UpdateTime: Date.now(),
        msg
    };
}

function 合并资源统计(base, extra = {}) {
    const merged = { ...base };
    for (const key of Object.keys(base)) {
        merged[key] = { ...base[key], ...(extra?.[key] || {}) };
    }
    return merged;
}

function 补全Usage结构(usage) {
    const source = usage || {};
    const base = 创建默认Usage(false);
    const normalized = { ...base, ...source };
    const updateTime = Number(source.UpdateTime || 0) || 0;
    const hasResourceData = !!source.resources;
    normalized.pages = Number(normalized.pages) || 0;
    normalized.workers = Number(normalized.workers) || 0;
    normalized.total = Number(normalized.total) || normalized.pages + normalized.workers;
    normalized.max = Number(normalized.max) || 免费额度.requestsDaily;
    normalized.UpdateTime = updateTime;
    normalized.resources = 合并资源统计(hasResourceData ? 创建默认资源统计() : 创建汇总资源统计(), normalized.resources || {});
    return normalized;
}

function 累加资源统计(target, source) {
    const data = 合并资源统计(创建默认资源统计(), source || {});

    target.d1.rowsRead += data.d1.rowsRead || 0;
    target.d1.rowsReadLimit += data.d1.rowsReadLimit || 免费额度.d1RowsReadDaily;
    target.d1.rowsWritten += data.d1.rowsWritten || 0;
    target.d1.rowsWrittenLimit += data.d1.rowsWrittenLimit || 免费额度.d1RowsWrittenDaily;
    target.d1.readQueries += data.d1.readQueries || 0;
    target.d1.writeQueries += data.d1.writeQueries || 0;
    target.d1.storageBytes += data.d1.storageBytes || 0;
    target.d1.storageLimitBytes += data.d1.storageLimitBytes || 免费额度.d1StorageBytes;
    target.d1.databases += data.d1.databases || 0;

    target.kv.reads += data.kv.reads || 0;
    target.kv.readsLimit += data.kv.readsLimit || 免费额度.kvReadsDaily;
    target.kv.writes += data.kv.writes || 0;
    target.kv.writesLimit += data.kv.writesLimit || 免费额度.kvWritesDaily;
    target.kv.deletes += data.kv.deletes || 0;
    target.kv.deletesLimit += data.kv.deletesLimit || 免费额度.kvDeletesDaily;
    target.kv.lists += data.kv.lists || 0;
    target.kv.listsLimit += data.kv.listsLimit || 免费额度.kvListsDaily;
    target.kv.operations += data.kv.operations || 0;
    target.kv.storageBytes += data.kv.storageBytes || 0;
    target.kv.storageLimitBytes += data.kv.storageLimitBytes || 免费额度.kvStorageBytes;
    target.kv.keys += data.kv.keys || 0;
    target.kv.namespaces += data.kv.namespaces || 0;

    target.r2.classA += data.r2.classA || 0;
    target.r2.classALimit += data.r2.classALimit || 免费额度.r2ClassAMonthly;
    target.r2.classB += data.r2.classB || 0;
    target.r2.classBLimit += data.r2.classBLimit || 免费额度.r2ClassBMonthly;
    target.r2.free += data.r2.free || 0;
    target.r2.other += data.r2.other || 0;
    target.r2.operations += data.r2.operations || 0;
    target.r2.storageBytes += data.r2.storageBytes || 0;
    target.r2.storageLimitBytes += data.r2.storageLimitBytes || 免费额度.r2StorageBytes;
    target.r2.objects += data.r2.objects || 0;
    target.r2.buckets += data.r2.buckets || 0;
}

function 获取统计时间窗口() {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    return {
        nowIso: now.toISOString(),
        dayStartIso: dayStart.toISOString(),
        monthStartIso: monthStart.toISOString(),
        dayStartDate: dayStart.toISOString().slice(0, 10),
        monthStartDate: monthStart.toISOString().slice(0, 10),
        dateEnd: now.toISOString().slice(0, 10)
    };
}

function 获取单账号查询间隔毫秒(env = {}) {
    const ms = Number(env.ACCOUNT_CHECK_INTERVAL_MS || env.account_check_interval_ms);
    if (Number.isFinite(ms) && ms > 0) return ms;

    const minutes = Number(env.ACCOUNT_CHECK_INTERVAL_MINUTES || env.account_check_interval_minutes || env.CHECK_INTERVAL_MINUTES || env.check_interval_minutes);
    if (Number.isFinite(minutes) && minutes > 0) return minutes * 60 * 1000;

    return 默认单账号查询间隔毫秒;
}

function 获取每轮最多外部子请求数(env = {}) {
    const configured = Number(env.MAX_EXTERNAL_SUBREQUESTS_PER_RUN || env.max_external_subrequests_per_run);
    if (Number.isFinite(configured) && configured > 0) return Math.min(Math.max(1, Math.floor(configured)), 默认每轮最多外部子请求数);
    return 默认每轮最多外部子请求数;
}

async function 后台更新请求数(env) {
    const lockKey = 'usage_refresh_lock';
    const now = Date.now();
    const lockTime = Number(await env.KV.get(lockKey)) || 0;
    if (lockTime && now - lockTime < 2 * 60 * 1000) return;

    await env.KV.put(lockKey, String(now), { expirationTtl: 120 });
    try {
        await 更新请求数(env);
    } finally {
        await env.KV.delete(lockKey);
    }
}

function 估算账号查询外部子请求数(account = {}) {
    if (account.AccountID) return 4;
    if (account.Email && account.GlobalAPIKey) return 5;
    return 5;
}

function 获取账号最后更新时间(account) {
    return Number(account?.UpdateTime || account?.Usage?.UpdateTime || 0) || 0;
}

function 补全账号Usage结构(account) {
    const usage = 补全Usage结构(account?.Usage || {});
    delete usage.UpdateTime;
    return usage;
}

function 写入账号查询结果(account, usage, queryTime = Date.now()) {
    const normalized = 补全Usage结构(usage || {});
    normalized.UpdateTime = queryTime;
    account.Usage = 补全账号Usage结构({ ...account, Usage: normalized });
    account.UpdateTime = queryTime;
    account.LastCheckTime = queryTime;
    delete account.LastCheckError;
    delete account.LastCheckErrorTime;
    return normalized;
}

function 写入账号查询失败(account, error, queryTime = Date.now()) {
    const lastUpdateTime = 获取账号最后更新时间(account);
    if (lastUpdateTime && !account.UpdateTime) account.UpdateTime = lastUpdateTime;
    account.LastCheckTime = queryTime;
    account.LastCheckErrorTime = queryTime;
    account.LastCheckError = typeof error === 'string' ? error : (error?.msg || error?.message || '查询失败');
    account.Usage = 补全账号Usage结构(account);
    return account.Usage;
}

async function 更新请求数(env, options = {}) {
    let usage_config_json = await env.KV.get('usage_config.json', { type: 'json' });
    let usage_json = 创建默认Usage(false);

    if (!usage_config_json) {
        // 不存在则创建一个空的配置文件
        usage_config_json = [];
        await env.KV.put('usage_config.json', JSON.stringify(usage_config_json));
        usage_json.success = true;
        usage_json.resources = 创建汇总资源统计();
        usage_json.msg = '⚠️ 尚未添加任何Cloudflare账号';
        await env.KV.put('usage.json', JSON.stringify(usage_json));
    } else if (Array.isArray(usage_config_json) && usage_config_json.length > 0) {
        const thresholdMs = Number(options.thresholdMs) || 获取单账号查询间隔毫秒(env);
        const externalSubrequestLimit = 获取每轮最多外部子请求数(env);
        const now = Date.now();

        const accountStates = usage_config_json.map((account, index) => {
            const lastUpdateTime = 获取账号最后更新时间(account);
            account.Usage = 补全账号Usage结构(account);
            if (lastUpdateTime && !account.UpdateTime) account.UpdateTime = lastUpdateTime;
            if (lastUpdateTime && !account.LastCheckTime) account.LastCheckTime = lastUpdateTime;
            return { account, index, lastUpdateTime };
        });

        const expiredAccounts = accountStates
            .filter(item => options.force || !item.lastUpdateTime || now - item.lastUpdateTime > thresholdMs)
            .sort((a, b) => (a.lastUpdateTime || 0) - (b.lastUpdateTime || 0));
        const accountsToRefresh = [];
        let estimatedExternalSubrequests = 0;
        for (const item of expiredAccounts) {
            const accountSubrequests = 估算账号查询外部子请求数(item.account);
            if (estimatedExternalSubrequests + accountSubrequests > externalSubrequestLimit) continue;
            accountsToRefresh.push({ ...item, estimatedExternalSubrequests: accountSubrequests });
            estimatedExternalSubrequests += accountSubrequests;
        }

        let refreshedCount = 0;
        let failedRefreshCount = 0;

        await Promise.all(accountsToRefresh.map(async ({ account }) => {
            try {
                const usage = await getCloudflareUsage(account.Email, account.GlobalAPIKey, account.AccountID, account.APIToken);
                if (!usage.success) {
                    写入账号查询失败(account, usage, Date.now());
                    failedRefreshCount += 1;
                    return;
                }
                写入账号查询结果(account, usage, Date.now());
                refreshedCount += 1;
            } catch (error) {
                failedRefreshCount += 1;
                console.error(`账号 ${account.ID} 查询失败:`, error.message);
                写入账号查询失败(account, error, Date.now());
            }
        }));

        // 累加所有账号的使用数据，未达到刷新阈值或超过本轮上限的账号使用历史数据。
        let total_pages = 0;
        let total_workers = 0;
        let total_max = 0;
        const total_resources = 创建汇总资源统计();

        for (const account of usage_config_json) {
            const usage = 补全账号Usage结构(account);
            account.Usage = usage;
            if (usage.success) {
                total_pages += usage.pages || 0;
                total_workers += usage.workers || 0;
                total_max += usage.max || 免费额度.requestsDaily;
                累加资源统计(total_resources, usage.resources);
            }
        }

        // 遍历完成后保存 usage_config_json 回 KV
        await env.KV.put('usage_config.json', JSON.stringify(usage_config_json));

        // 将所有账号的数据累加到 usage_json 中并保存回 KV
        usage_json.success = true;
        usage_json.pages = total_pages;
        usage_json.workers = total_workers;
        usage_json.total = total_pages + total_workers;
        usage_json.max = total_max;
        usage_json.resources = total_resources;
        usage_json.UpdateTime = Date.now();
        usage_json.RefreshStats = {
            refreshed: refreshedCount,
            failed: failedRefreshCount,
            cached: Math.max(usage_config_json.length - refreshedCount, 0),
            skippedByLimit: Math.max(expiredAccounts.length - accountsToRefresh.length, 0),
            maxRefresh: accountsToRefresh.length,
            externalSubrequestsEstimated: estimatedExternalSubrequests,
            externalSubrequestLimit,
            perAccountExternalSubrequests: { withAccountId: 4, withoutAccountId: 5 },
            thresholdMs
        };
        usage_json.msg = failedRefreshCount > 0
            ? `⚠️ 部分账号查询失败（本次刷新 ${refreshedCount} 个账号，失败 ${failedRefreshCount} 个，${usage_json.RefreshStats.cached} 个使用历史数据）`
            : `✅ 成功更新免费额度使用数据（本次刷新 ${refreshedCount} 个账号，${usage_json.RefreshStats.cached} 个使用历史数据）`;
        await env.KV.put('usage.json', JSON.stringify(usage_json));
    } else {
        // 配置文件存在但为空数组或无效格式
        usage_json.success = true;
        usage_json.resources = 创建汇总资源统计();
        usage_json.UpdateTime = Date.now();
        usage_json.msg = '⚠️ 尚未添加任何Cloudflare账号';
        await env.KV.put('usage.json', JSON.stringify(usage_json));
    }

    return usage_json;
}

async function MD5MD5(文本) {
    const 编码器 = new TextEncoder();

    const 第一次哈希 = await crypto.subtle.digest('MD5', 编码器.encode(文本));
    const 第一次哈希数组 = Array.from(new Uint8Array(第一次哈希));
    const 第一次十六进制 = 第一次哈希数组.map(字节 => 字节.toString(16).padStart(2, '0')).join('');

    const 第二次哈希 = await crypto.subtle.digest('MD5', 编码器.encode(第一次十六进制.slice(7, 27)));
    const 第二次哈希数组 = Array.from(new Uint8Array(第二次哈希));
    const 第二次十六进制 = 第二次哈希数组.map(字节 => 字节.toString(16).padStart(2, '0')).join('');

    return 第二次十六进制.toLowerCase();
}

function 数字(value) {
    return Number(value) || 0;
}

function 合计请求数(groups) {
    return groups?.reduce((total, item) => total + 数字(item?.sum?.requests), 0) || 0;
}

function 规范化动作名称(action) {
    return String(action || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function 选择最新分组(groups, idField, timeField) {
    const latest = new Map();
    for (const group of groups || []) {
        const dimensions = group?.dimensions || {};
        const id = dimensions[idField] || '__account';
        const time = String(dimensions[timeField] || '');
        const current = latest.get(id);
        if (!current || time >= current.time) latest.set(id, { time, group });
    }
    return Array.from(latest.values()).map(item => item.group);
}

async function 发送GraphQL请求(API, headers, query, variables) {
    const res = await fetch(`${API}/graphql`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query, variables })
    });

    if (!res.ok) throw new Error(`查询失败: ${res.status}`);
    const result = await res.json();
    if (result.errors?.length) throw new Error(result.errors.map(error => error.message).join('; '));

    const account = result?.data?.viewer?.accounts?.[0];
    if (!account) throw new Error("未找到账户数据");
    return account;
}

async function 获取Cloudflare账户ID(API, headers, Email) {
    const r = await fetch(`${API}/accounts`, { method: "GET", headers });
    if (!r.ok) throw new Error(`账户获取失败: ${r.status}`);
    const d = await r.json();
    if (!d?.result?.length) throw new Error("未找到账户");
    const idx = d.result.findIndex(account => account.name?.toLowerCase().startsWith(Email.toLowerCase()));
    return d.result[idx >= 0 ? idx : 0]?.id;
}

async function 查询WorkersPages统计(API, headers, AccountID, 时间窗口) {
    const account = await 发送GraphQL请求(API, headers, `query getBillingMetrics($AccountID: String!, $filter: AccountWorkersInvocationsAdaptiveFilter_InputObject) {
        viewer { accounts(filter: {accountTag: $AccountID}) {
            pagesFunctionsInvocationsAdaptiveGroups(limit: 1000, filter: $filter) { sum { requests } }
            workersInvocationsAdaptive(limit: 10000, filter: $filter) { sum { requests } }
        } }
    }`, {
        AccountID,
        filter: { datetime_geq: 时间窗口.dayStartIso, datetime_leq: 时间窗口.nowIso }
    });

    return {
        pages: 合计请求数(account.pagesFunctionsInvocationsAdaptiveGroups),
        workers: 合计请求数(account.workersInvocationsAdaptive)
    };
}

async function 查询D1统计(API, headers, AccountID, 时间窗口) {
    const d1 = 创建默认资源统计().d1;
    const account = await 发送GraphQL请求(API, headers, `query D1Usage($accountTag: String!, $dayStart: Date!, $dateEnd: Date!, $storageStart: Date!) {
        viewer { accounts(filter: {accountTag: $accountTag}) {
            d1AnalyticsAdaptiveGroups(limit: 10000, filter: {date_geq: $dayStart, date_leq: $dateEnd}) {
                sum { rowsRead rowsWritten readQueries writeQueries }
                dimensions { date databaseId }
            }
            d1StorageAdaptiveGroups(limit: 10000, filter: {date_geq: $storageStart, date_leq: $dateEnd}, orderBy: [date_DESC]) {
                max { databaseSizeBytes }
                dimensions { date databaseId }
            }
        } }
    }`, {
        accountTag: AccountID,
        dayStart: 时间窗口.dayStartDate,
        dateEnd: 时间窗口.dateEnd,
        storageStart: 时间窗口.monthStartDate
    });

    for (const group of account.d1AnalyticsAdaptiveGroups || []) {
        d1.rowsRead += 数字(group?.sum?.rowsRead);
        d1.rowsWritten += 数字(group?.sum?.rowsWritten);
        d1.readQueries += 数字(group?.sum?.readQueries);
        d1.writeQueries += 数字(group?.sum?.writeQueries);
    }

    const storageGroups = 选择最新分组(account.d1StorageAdaptiveGroups, 'databaseId', 'date');
    d1.databases = storageGroups.length;
    d1.storageBytes = storageGroups.reduce((total, group) => total + 数字(group?.max?.databaseSizeBytes), 0);
    return d1;
}

async function 查询KV统计(API, headers, AccountID, 时间窗口) {
    const kv = 创建默认资源统计().kv;
    const account = await 发送GraphQL请求(API, headers, `query KvUsage($accountTag: String!, $dayStart: Date!, $dateEnd: Date!, $storageStart: Date!) {
        viewer { accounts(filter: {accountTag: $accountTag}) {
            kvOperationsAdaptiveGroups(limit: 10000, filter: {date_geq: $dayStart, date_leq: $dateEnd}) {
                sum { requests }
                dimensions { actionType }
            }
            kvStorageAdaptiveGroups(limit: 10000, filter: {date_geq: $storageStart, date_leq: $dateEnd}, orderBy: [date_DESC]) {
                max { keyCount byteCount }
                dimensions { date namespaceId }
            }
        } }
    }`, {
        accountTag: AccountID,
        dayStart: 时间窗口.dayStartDate,
        dateEnd: 时间窗口.dateEnd,
        storageStart: 时间窗口.monthStartDate
    });

    for (const group of account.kvOperationsAdaptiveGroups || []) {
        const requests = 数字(group?.sum?.requests);
        const actionType = String(group?.dimensions?.actionType || '').toLowerCase();
        kv.operations += requests;

        if (actionType.includes('read')) kv.reads += requests;
        else if (actionType.includes('write')) kv.writes += requests;
        else if (actionType.includes('delete')) kv.deletes += requests;
        else if (actionType.includes('list')) kv.lists += requests;
    }

    const storageGroups = 选择最新分组(account.kvStorageAdaptiveGroups, 'namespaceId', 'date');
    kv.namespaces = storageGroups.length;
    kv.keys = storageGroups.reduce((total, group) => total + 数字(group?.max?.keyCount), 0);
    kv.storageBytes = storageGroups.reduce((total, group) => total + 数字(group?.max?.byteCount), 0);
    return kv;
}

async function 查询R2统计(API, headers, AccountID, 时间窗口) {
    const r2 = 创建默认资源统计().r2;
    const account = await 发送GraphQL请求(API, headers, `query R2Usage($accountTag: String!, $monthStart: Time!, $now: Time!) {
        viewer { accounts(filter: {accountTag: $accountTag}) {
            r2OperationsAdaptiveGroups(limit: 10000, filter: {datetime_geq: $monthStart, datetime_leq: $now}) {
                sum { requests }
                dimensions { actionType actionStatus }
            }
            r2StorageAdaptiveGroups(limit: 10000, filter: {datetime_geq: $monthStart, datetime_leq: $now}, orderBy: [datetime_DESC]) {
                max { objectCount uploadCount payloadSize metadataSize }
                dimensions { datetime bucketName }
            }
        } }
    }`, {
        accountTag: AccountID,
        monthStart: 时间窗口.monthStartIso,
        now: 时间窗口.nowIso
    });

    for (const group of account.r2OperationsAdaptiveGroups || []) {
        const status = String(group?.dimensions?.actionStatus || 'success').toLowerCase();
        if (status && status !== 'success') continue;

        const requests = 数字(group?.sum?.requests);
        const action = 规范化动作名称(group?.dimensions?.actionType);
        r2.operations += requests;

        if (R2_CLASS_A_ACTIONS.has(action)) r2.classA += requests;
        else if (R2_CLASS_B_ACTIONS.has(action)) r2.classB += requests;
        else if (R2_FREE_ACTIONS.has(action)) r2.free += requests;
        else r2.other += requests;
    }

    const storageGroups = 选择最新分组(account.r2StorageAdaptiveGroups, 'bucketName', 'datetime');
    r2.buckets = storageGroups.length;
    r2.objects = storageGroups.reduce((total, group) => total + 数字(group?.max?.objectCount), 0);
    r2.storageBytes = storageGroups.reduce((total, group) => total + 数字(group?.max?.payloadSize) + 数字(group?.max?.metadataSize), 0);
    return r2;
}

async function getCloudflareUsage(Email, GlobalAPIKey, AccountID, APIToken) {
    const API = "https://api.cloudflare.com/client/v4";
    const cfg = { "Content-Type": "application/json" };
    const fallback = 创建默认Usage(false);
    fallback.max = 免费额度.requestsDaily;

    try {
        if (!AccountID && (!Email || !GlobalAPIKey)) return fallback;

        const hdr = APIToken ? { ...cfg, "Authorization": `Bearer ${APIToken}` } : { ...cfg, "X-AUTH-EMAIL": Email, "X-AUTH-KEY": GlobalAPIKey };
        if (!AccountID) AccountID = await 获取Cloudflare账户ID(API, hdr, Email);

        const 时间窗口 = 获取统计时间窗口();
        const usage = 创建默认Usage(true, '✅ 成功更新免费额度使用数据');
        const errors = [];
        const safeQuery = async (label, query, defaultValue) => {
            try {
                return await query();
            } catch (error) {
                console.warn(`${label} 统计失败:`, error.message);
                errors.push(`${label}: ${error.message}`);
                return defaultValue;
            }
        };

        const [core, d1, kv, r2] = await Promise.all([
            查询WorkersPages统计(API, hdr, AccountID, 时间窗口),
            safeQuery('D1', () => 查询D1统计(API, hdr, AccountID, 时间窗口), 创建默认资源统计().d1),
            safeQuery('KV', () => 查询KV统计(API, hdr, AccountID, 时间窗口), 创建默认资源统计().kv),
            safeQuery('R2', () => 查询R2统计(API, hdr, AccountID, 时间窗口), 创建默认资源统计().r2)
        ]);

        usage.pages = core.pages;
        usage.workers = core.workers;
        usage.total = core.pages + core.workers;
        usage.max = 免费额度.requestsDaily;
        usage.resources.d1 = d1;
        usage.resources.kv = kv;
        usage.resources.r2 = r2;
        if (errors.length) usage.errors = errors;

        console.log(`统计结果 - Pages: ${usage.pages}, Workers: ${usage.workers}, D1读: ${d1.rowsRead}, KV读: ${kv.reads}, R2 A/B: ${r2.classA}/${r2.classB}`);
        return usage;

    } catch (error) {
        console.error('获取使用量错误:', error.message);
        fallback.msg = '❌ 获取使用量失败: ' + error.message;
        return fallback;
    }
}

function 掩码敏感信息(文本, 前缀长度 = 3, 后缀长度 = 2) {
    if (!文本 || typeof 文本 !== 'string') return 文本;
    if (文本.length <= 前缀长度 + 后缀长度) return 文本; // 如果长度太短，直接返回

    const 前缀 = 文本.slice(0, 前缀长度);
    const 后缀 = 文本.slice(-后缀长度);
    const 星号数量 = 文本.length - 前缀长度 - 后缀长度;

    return `${前缀}${'*'.repeat(星号数量)}${后缀}`;
}

////////////////////////////////HTML页面//////////////////////////////////

async function UsagePanel管理面板(TOKEN) {
    const userIDMD5 = await MD5MD5(TOKEN);
    const UUID = [userIDMD5.slice(0, 8), userIDMD5.slice(8, 12), '4' + userIDMD5.slice(13, 16), '8' + userIDMD5.slice(17, 20), userIDMD5.slice(20)].join('-');
    const 专属ID标识 = 'ed' + userIDMD5.slice(0, 8);
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UsagePanel 管理面板</title>
    <link rel="icon" href="https://cf-assets.www.cloudflare.com/dzlvafdwdttg/5uhbWfhjepEoUiM9phzhgJ/9658369030266cde9e35a3c5d4e4beb2/cloud-upload.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #6366f1;
            --primary-glow: rgba(99, 102, 241, 0.4);
            --accent: #a855f7;
            --background: #0f172a;
            --card-bg: rgba(30, 41, 59, 0.7);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --stroke: rgba(255, 255, 255, 0.08);
            --danger: #ef4444;
            --heading-grad: linear-gradient(135deg, #fff 0%, #cbd5e1 100%);
            --item-bg: rgba(255, 255, 255, 0.03);
            --footer-color: rgba(255, 255, 255, 0.2);
            --footer-hover: rgba(255, 255, 255, 0.4);
            --track-bg: rgba(0, 0, 0, 0.2);
            --input-bg: rgba(0, 0, 0, 0.2);
        }

        :root.light-mode {
            --primary: #4f46e5;
            --primary-glow: rgba(79, 70, 229, 0.2);
            --accent: #9333ea;
            --background: #f1f5f9;
            --card-bg: rgba(255, 255, 255, 0.8);
            --text-main: #0f172a;
            --text-muted: #64748b;
            --stroke: rgba(0, 0, 0, 0.1);
            --danger: #dc2626;
            --heading-grad: linear-gradient(135deg, #1e293b 0%, #475569 100%);
            --item-bg: rgba(0, 0, 0, 0.03);
            --footer-color: rgba(15, 23, 42, 0.4);
            --footer-hover: var(--primary);
            --track-bg: rgba(0, 0, 0, 0.08);
            --input-bg: rgba(255, 255, 255, 0.8);
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        html {
            scrollbar-gutter: stable both-edges;
        }

        @supports not (scrollbar-gutter: stable) {
            html { overflow-y: scroll; }
        }

        body {
            font-family: 'Outfit', sans-serif;
            background-color: var(--background);
            background-image: 
                radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%),
                radial-gradient(at 100% 100%, rgba(168, 85, 247, 0.15) 0px, transparent 50%);
            background-attachment: fixed;
            color: var(--text-main);
            min-height: 100vh;
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .top-nav {
            width: 100%;
            max-width: 680px;
            display: flex;
            justify-content: flex-end;
            gap: 1rem;
            margin-bottom: 1rem;
            animation: slideDown 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .nav-btn {
            padding: 0.6rem 1.2rem;
            background: var(--card-bg);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--stroke);
            border-radius: 12px;
            color: var(--text-main);
            font-family: 'Outfit', sans-serif;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .nav-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            transform: translateY(-2px);
            border-color: var(--primary);
        }

        .nav-btn.logout:hover {
            border-color: var(--danger);
            color: var(--danger);
        }

        .container {
            width: 100%;
            max-width: 680px;
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
            animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .glass-card {
            background: var(--card-bg);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 1px solid var(--stroke);
            border-radius: 24px;
            padding: 2rem;
            box-shadow: 
                0 25px 50px -12px rgba(0, 0, 0, 0.5),
                0 0 0 1px rgba(255, 255, 255, 0.05) inset;
        }

        .summary-card {
            position: static;
        }

        .accounts-card {
            min-width: 0;
        }

        header {
            margin-bottom: 1.5rem;
        }

        h1, h2 {
            font-size: 1.5rem;
            font-weight: 700;
            background: var(--heading-grad);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            margin-bottom: 1rem;
            letter-spacing: -0.01em;
        }

        .module-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
        }

        .module-header h2 { margin-bottom: 0; }

        .add-btn {
            padding: 0.6rem 1.2rem;
            background: linear-gradient(135deg, var(--primary), var(--accent));
            border: none;
            border-radius: 12px;
            color: white;
            font-family: 'Outfit', sans-serif;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .add-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 8px 20px var(--primary-glow);
        }

        /* Usage Section Styles (from homepage) */
        .usage-section { margin-bottom: 2rem; position: relative; }
        .usage-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 1rem; }
        .label { font-size: 0.9rem; color: var(--text-muted); font-weight: 500; }
        .percentage { font-family: 'Outfit', monospace; font-size: 1.25rem; font-weight: 600; color: var(--gradient-color, var(--text-main)); text-shadow: 0 0 20px var(--gradient-color-shadow, var(--primary-glow)); transition: color 0.6s ease, text-shadow 0.6s ease; }
        .progress-track { background: var(--track-bg); border: 1px solid var(--stroke); border-radius: 999px; height: 14px; overflow: hidden; position: relative; }
        .progress-bar { height: 100%; background: linear-gradient(90deg, #10b981 0%, #eab308 50%, #ef4444 100%); background-size: var(--bg-size, 100%); background-position: left; border-radius: 999px; width: 0%; transition: width 1.5s cubic-bezier(0.34, 1.56, 0.64, 1); position: relative; overflow: hidden; }
        .progress-bar::after { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent); transform: translateX(-100%); animation: shimmer 2.5s infinite; }
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1.5rem; }
        .mini-card { 
            background: var(--item-bg); 
            border: 1px solid var(--stroke); 
            border-radius: 16px; 
            padding: 1rem 1.25rem; 
            display: flex; 
            align-items: center; 
            gap: 1.25rem;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
        }
        .mini-card:hover { 
            background: rgba(99, 102, 241, 0.08); 
            transform: translateY(-4px); 
            border-color: var(--primary); 
            box-shadow: 0 10px 20px -5px rgba(0, 0, 0, 0.2);
        }
        .mini-icon { font-size: 1.75rem; margin-bottom: 0; line-height: 1; }
        .mini-info { display: flex; flex-direction: column; justify-content: center; }
        .mini-label { font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0; letter-spacing: 0.05em; font-weight: 500; }
        .mini-value { font-size: 1.25rem; font-weight: 700; color: var(--text-main); line-height: 1.2; }
        .total-text { text-align: right; font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem; }
        .quota-details { margin-top: 1.25rem; overflow: hidden; }
        .quota-details[open] { display: flex; flex-direction: column; }
        .quota-details.quota-animating .quota-summary { pointer-events: none; }
        .quota-summary { list-style: none; background: linear-gradient(135deg, rgba(99, 102, 241, 0.16), rgba(14, 165, 233, 0.1)); border: 1px solid rgba(99, 102, 241, 0.5); border-radius: 14px; padding: 0.8rem 0.85rem; cursor: pointer; display: flex; justify-content: space-between; gap: 0.75rem; align-items: center; color: var(--text-main); font-size: 0.85rem; font-weight: 700; box-shadow: 0 12px 28px -18px var(--primary-glow), inset 0 1px 0 rgba(255,255,255,0.08); transition: all 0.3s ease; }
        .quota-summary::-webkit-details-marker { display: none; }
        .quota-summary:hover, .quota-summary:focus-visible { border-color: var(--primary); background: linear-gradient(135deg, rgba(99, 102, 241, 0.24), rgba(14, 165, 233, 0.14)); box-shadow: 0 16px 32px -18px var(--primary-glow), 0 0 0 3px rgba(99, 102, 241, 0.12); outline: none; }
        .quota-summary-title { min-width: 0; }
        .quota-summary::after { content: '展开细节'; color: #fff; background: var(--primary); border-radius: 999px; padding: 0.38rem 0.7rem; font-size: 0.75rem; font-weight: 700; white-space: nowrap; box-shadow: 0 10px 20px -12px var(--primary-glow); }
        .quota-details[open] .quota-summary::after { content: '收起细节'; }
        .quota-details[open] .quota-summary { order: 2; margin-top: 0.875rem; }
        .quota-summary-meta { color: var(--text-muted); font-size: 0.75rem; font-weight: 600; margin-left: auto; white-space: nowrap; }
        .quota-body { overflow: hidden; }
        .quota-details[open] .quota-body { order: 1; }
        .quota-details.quota-animating .quota-body { will-change: height, opacity, transform; }
        .quota-list { display: grid; gap: 0.875rem; margin-top: 0.875rem; }
        .quota-details[open] .quota-list { margin-top: 0; }
        .quota-item { background: var(--item-bg); border: 1px solid var(--stroke); border-radius: 14px; padding: 0.875rem 1rem; }
        .quota-group-head { display: flex; justify-content: space-between; gap: 0.75rem; align-items: center; margin-bottom: 0.75rem; }
        .quota-group-title { color: var(--text-main); font-size: 0.9rem; font-weight: 700; }
        .quota-group-meta { color: var(--text-muted); font-size: 0.75rem; font-variant-numeric: tabular-nums; text-align: right; }
        .quota-row { margin-top: 0.75rem; }
        .quota-group-head + .quota-row { margin-top: 0; }
        .quota-top { display: flex; justify-content: space-between; gap: 0.75rem; color: var(--text-muted); font-size: 0.78rem; margin-bottom: 0.55rem; }
        .quota-title { color: var(--text-main); font-weight: 600; }
        .quota-meta { text-align: right; font-variant-numeric: tabular-nums; }
        .quota-track { height: 7px; background: var(--track-bg); border: 1px solid var(--stroke); border-radius: 999px; overflow: hidden; }
        .quota-fill { height: 100%; border-radius: inherit; min-width: 0; transition: width 1s ease; }
        .resource-note { margin-top: 0.875rem; color: var(--text-muted); font-size: 0.75rem; line-height: 1.5; }

        /* Account List Styles */
        .account-list { display: flex; flex-direction: column; gap: 1rem; }
        .account-item {
            background: var(--item-bg);
            border: 1px solid var(--stroke);
            border-radius: 20px;
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 1.25rem;
            transition: all 0.3s ease;
        }
        .account-item:hover {
            border-color: rgba(99, 102, 241, 0.3);
            background: rgba(99, 102, 241, 0.02);
        }
        .account-info { display: flex; justify-content: space-between; align-items: center; }
        .account-name { font-weight: 600; font-size: 1.1rem; color: var(--text-main); display: flex; align-items: center; gap: 0.5rem; }
        .account-id { font-size: 0.8rem; color: var(--text-muted); font-family: monospace; }
        
        .delete-btn {
            padding: 0.5rem 1rem;
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.2);
            border-radius: 10px;
            color: #fca5a5;
            font-size: 0.8rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        .delete-btn:hover {
            background: var(--danger);
            color: white;
            border-color: var(--danger);
            box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        }

        /* Modal Styles */
        .modal-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(8px);
            display: none;
            justify-content: center;
            align-items: center;
            z-index: 2000;
            animation: fadeIn 0.3s ease;
        }
        .modal-overlay.active { display: flex; }
        .modal {
            background: var(--card-bg);
            backdrop-filter: blur(24px);
            border: 1px solid var(--stroke);
            border-radius: 24px;
            padding: 2rem;
            width: 100%;
            max-width: 400px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            animation: modalSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .modal h3 { margin-bottom: 1.5rem; text-align: center; }
        .input-group { margin-bottom: 1rem; }
        .input-group label { display: block; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem; }
        .input-group input {
            width: 100%;
            padding: 0.75rem 1rem;
            background: var(--input-bg);
            border: 1px solid var(--stroke);
            border-radius: 12px;
            color: var(--text-main);
            outline: none;
            transition: border-color 0.3s;
        }
        .input-group input:focus { border-color: var(--primary); }
        .modal-actions { display: flex; gap: 1rem; margin-top: 1.5rem; }
        .modal-btn { flex: 1; padding: 0.75rem; border-radius: 12px; cursor: pointer; font-weight: 600; border: none; transition: all 0.3s; }
        .modal-btn.cancel { background: rgba(255, 255, 255, 0.05); color: var(--text-main); }
        .modal-btn.confirm { background: linear-gradient(135deg, var(--primary), var(--accent)); color: white; }
        .modal-btn:hover { transform: translateY(-2px); }

        .toast {
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            background: linear-gradient(135deg, var(--primary), var(--accent));
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
            z-index: 3000;
            opacity: 0;
            visibility: hidden;
            transform: translateX(30px) translateY(30px);
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .toast.active { 
            opacity: 1;
            visibility: visible;
            transform: translateX(0) translateY(0); 
        }

        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalSlideUp { from { opacity: 0; transform: translateY(30px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes shimmer { 100% { transform: translateX(100%); } }

        .loading-spinner {
            width: 32px;
            height: 32px;
            border: 3px solid rgba(255,255,255,0.1);
            border-top-color: var(--primary);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading-wrap { display: flex; justify-content: center; padding: 3rem; }

        @media (min-width: 1024px) {
            .top-nav {
                max-width: 1180px;
            }

            .container {
                max-width: 1180px;
                display: grid;
                grid-template-columns: minmax(320px, 0.85fr) minmax(520px, 1.15fr);
                align-items: start;
            }

            .summary-card {
                position: sticky;
                top: 1.5rem;
            }
        }

        .footer {
            grid-column: 1 / -1;
            margin-top: 2.5rem;
            text-align: center;
            font-size: 0.75rem;
            color: var(--footer-color);
            transition: color 0.3s;
        }
        
        .footer:hover {
            color: var(--footer-hover);
        }

        a.footer {
            color: inherit;
            text-decoration: none;
        }

        a.footer:hover {
            text-decoration: underline;
        }

        /* ============ 移动端响应式布局 ============ */
        @media (max-width: 768px) {
            body {
                padding: 1rem;
            }

            .top-nav {
                flex-wrap: wrap;
                gap: 0.5rem;
                margin-bottom: 1.5rem;
            }

            .nav-btn {
                padding: 0.5rem 0.8rem;
                font-size: 0.8rem;
                border-radius: 10px;
                flex: 1;
                min-width: calc(50% - 0.25rem);
                justify-content: center;
            }

            .nav-btn svg {
                width: 16px;
                height: 16px;
            }

            .container {
                max-width: 680px;
                display: flex;
                flex-direction: column;
                gap: 1.5rem;
            }

            .summary-card {
                position: static;
            }

            .glass-card {
                padding: 1.5rem;
                border-radius: 20px;
            }

            h1, h2 {
                font-size: 1.25rem;
                margin-bottom: 1rem;
            }

            .module-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 1rem;
                margin-bottom: 1.5rem;
            }

            .add-btn {
                width: 100%;
                padding: 0.7rem 1rem;
            }

            .stats-grid {
                grid-template-columns: 1fr;
                gap: 0.75rem;
                margin-top: 1rem;
            }

            .mini-card {
                padding: 1rem;
                gap: 1rem;
            }

            .mini-icon {
                font-size: 1.5rem;
            }

            .mini-label {
                font-size: 0.65rem;
            }

            .mini-value {
                font-size: 1.1rem;
            }

            .account-item {
                padding: 1.25rem;
                border-radius: 16px;
                gap: 1rem;
            }

            .account-info {
                flex-direction: column;
                align-items: flex-start;
                gap: 1rem;
            }

            .delete-btn {
                width: 100%;
                text-align: center;
                padding: 0.6rem 1rem;
            }

            .usage-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 0.5rem;
            }

            .percentage {
                font-size: 1.1rem;
            }

            .modal {
                max-width: calc(100% - 2rem);
                padding: 1.5rem;
                border-radius: 20px;
            }

            .modal h3 {
                font-size: 1.1rem;
                margin-bottom: 1.25rem;
            }

            .input-group {
                margin-bottom: 0.875rem;
            }

            .input-group input {
                padding: 0.65rem 0.875rem;
                font-size: 0.9rem;
            }

            .modal-actions {
                gap: 0.75rem;
                margin-top: 1.25rem;
            }

            .modal-btn {
                padding: 0.65rem;
                font-size: 0.9rem;
            }

            .toast {
                bottom: 1rem;
                right: 1rem;
                left: 1rem;
                padding: 0.875rem 1.25rem;
                font-size: 0.875rem;
                border-radius: 10px;
            }

            .footer {
                grid-column: auto;
                margin-top: 2rem;
                font-size: 0.7rem;
            }

            .total-text {
                font-size: 0.75rem;
            }

            .quota-top {
                flex-direction: column;
                gap: 0.35rem;
            }

            .quota-summary, .quota-group-head {
                align-items: flex-start;
                flex-direction: column;
                gap: 0.35rem;
            }

            .quota-summary-meta {
                margin-left: 0;
            }

            .quota-group-meta {
                text-align: left;
            }

            .quota-meta {
                text-align: left;
            }

            .account-id {
                font-size: 0.75rem;
                word-break: break-all;
            }
        }

        /* 超小屏幕优化 */
        @media (max-width: 420px) {
            body {
                padding: 0.75rem;
            }

            .glass-card {
                padding: 1.25rem;
                border-radius: 18px;
            }

            h1, h2 {
                font-size: 1.1rem;
            }

            .nav-btn {
                min-width: 100%;
                font-size: 0.75rem;
            }

            .stats-grid {
                gap: 0.5rem;
            }

            .mini-card {
                padding: 0.875rem;
            }

            .account-item {
                padding: 1rem;
            }

            .modal {
                padding: 1.25rem;
            }
        }
    </style>
</head>
<body>
    <div class="top-nav">
        <button class="nav-btn" onclick="toggleTheme()" id="theme-toggle">
            <svg id="sun-icon" style="display:none" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="18.36" x2="5.64" y2="19.78"></line><line x1="18.36" y1="4.22" x2="19.78" y2="5.64"></line></svg>
            <svg id="moon-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
            <span id="theme-text">切换显示模式</span>
        </button>
        <button class="nav-btn" onclick="copyUsageAPI()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            复制 UsageAPI
        </button>
        <button class="nav-btn logout" onclick="logout()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            退出管理面板
        </button>
    </div>

    <div class="container">
        <div class="glass-card summary-card">
            <h1>Cloudflare 额度汇总</h1>
            <div id="summary-content">
                <div class="loading-wrap"><div class="loading-spinner"></div></div>
            </div>
        </div>

        <div class="glass-card accounts-card">
            <div class="module-header">
                <h2>☁️ Cloudflare 账号管理</h2>
                <button class="add-btn" onclick="openAddModal()">添加账号</button>
            </div>
            <div id="config-content">
                <div class="loading-wrap"><div class="loading-spinner"></div></div>
            </div>
        </div>

        <div class="footer">
            由 <a href="https://github.com/cmliu/CF-Workers-UsagePanel" target="_blank" rel="noopener" class="footer">CF-Workers-UsagePanel</a> 强力驱动
        </div>
    </div>

    <!-- 添加账号模态框 -->
    <div class="modal-overlay" id="addModal">
        <div class="modal" style="max-width: 440px;">
            <h3>⚙️ 添加 Cloudflare 账号</h3>
            <div class="input-group">
                <label>账号备注</label>
                <input type="text" id="newName" placeholder="我的账号">
            </div>
            <div class="input-group">
                <label>验证方式</label>
                <select id="authMethod" onchange="switchAuthMethod()" style="width: 100%; padding: 0.75rem 1rem; background: var(--input-bg); border: 1px solid var(--stroke); border-radius: 12px; color: var(--text-main); outline: none; cursor: pointer; appearance: none; -webkit-appearance: none;">
                    <option value="token">Account ID + API Token</option>
                    <option value="global">Email + Global API Key</option>
                </select>
            </div>
            <div id="tokenFields">
                <div class="input-group">
                    <label>Account ID</label>
                    <input type="text" id="newAccountID" placeholder="Workers和Pages 面板右侧的 AccountID">
                </div>
                <div class="input-group">
                    <label>API Token</label>
                    <input type="password" id="newAPIToken" placeholder='包含"阅读分析数据和日志"权限的 API令牌'>
                </div>
            </div>
            <div id="globalFields" style="display: none;">
                <div class="input-group">
                    <label>Email</label>
                    <input type="email" id="newEmail" placeholder="您的 Cloudflare 账号邮箱">
                </div>
                <div class="input-group">
                    <label>Global API Key</label>
                    <input type="password" id="newGlobalAPIKey" placeholder="您的 Global API Key">
                </div>
            </div>
            <div class="modal-actions">
                <button class="modal-btn cancel" onclick="closeAddModal()">取消</button>
                <button class="modal-btn confirm" onclick="handleAddAccount()">添加</button>
            </div>
        </div>
    </div>

    <div class="toast" id="toast"></div>

    <script>
        const TOKEN = '${TOKEN}';

        function initTheme() {
            const savedTheme = localStorage.getItem('theme');
            const systemLight = window.matchMedia('(prefers-color-scheme: light)').matches;
            if (savedTheme === 'light' || (!savedTheme && systemLight)) {
                document.documentElement.classList.add('light-mode');
            }
            updateThemeIcons();
        }

        function toggleTheme() {
            const isLight = document.documentElement.classList.toggle('light-mode');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
            updateThemeIcons();
        }

        function updateThemeIcons() {
            const isLight = document.documentElement.classList.contains('light-mode');
            document.getElementById('sun-icon').style.display = isLight ? 'none' : 'block';
            document.getElementById('moon-icon').style.display = isLight ? 'block' : 'none';
        }

        initTheme();
        
        function showToast(msg) {
            const toast = document.getElementById('toast');
            toast.textContent = msg;
            toast.classList.add('active');
            setTimeout(() => toast.classList.remove('active'), 3000);
        }

        function copyUsageAPI() {
            const url = \`https://\${window.location.hostname}/usage.json?token=\${TOKEN}\`;
            navigator.clipboard.writeText(url).then(() => {
                showToast('✅ UsageAPI 已复制到粘贴板');
            });
        }

        async function logout() {
            try {
                await fetch('./api/logout', { method: 'POST' });
            } catch (err) {
                console.error('登出请求失败:', err);
            } finally {
                window.location.href = '/';
            }
        }

        // 根据百分比计算颜色（绿 -> 黄 -> 红）
        function getGradientColor(percent) {
            percent = Math.max(0, Math.min(100, percent));
            
            let r, g, b;
            
            if (percent <= 50) {
                // 绿色 (16, 185, 129) 到 黄色 (234, 179, 8)
                const t = percent / 50;
                r = Math.round(16 + (234 - 16) * t);
                g = Math.round(185 + (179 - 185) * t);
                b = Math.round(129 - 129 * t);
            } else {
                // 黄色 (234, 179, 8) 到 红色 (239, 68, 68)
                const t = (percent - 50) / 50;
                r = Math.round(234 + (239 - 234) * t);
                g = Math.round(179 - 179 * t);
                b = Math.round(8 + (68 - 8) * t);
            }
            
            return \`rgb(\${r}, \${g}, \${b})\`;
        }

        // 获取对应百分比的色阴影
        function getGradientShadow(percent) {
            const color = getGradientColor(percent);
            const rgb = color.match(/\\d+/g);
            return \`rgba(\${rgb[0]}, \${rgb[1]}, \${rgb[2]}, 0.4)\`;
        }

        // 应用颜色到进度条容器
        function applyGradientColor(container, percent) {
            const color = getGradientColor(percent);
            const shadow = getGradientShadow(percent);
            container.style.setProperty('--gradient-color', color);
            container.style.setProperty('--gradient-color-shadow', \`0 0 20px \${shadow}\`);
            
            // 设置进度条背景大小，让渐变正确显示
            const bar = container.querySelector('.progress-bar');
            if (bar && percent > 0) {
                const bgSize = (100 / percent) * 100;
                bar.style.setProperty('--bg-size', \`\${bgSize}%\`);
            }
        }

        function percentOf(used, limit) {
            used = Number(used) || 0;
            limit = Number(limit) || 0;
            return limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
        }

        function formatNumber(value) {
            return (Number(value) || 0).toLocaleString();
        }

        function formatBytes(bytes) {
            bytes = Number(bytes) || 0;
            if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
            if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
            if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
            return bytes.toLocaleString() + ' B';
        }

        function getResources(data) {
            return (data && data.resources) || { d1: {}, kv: {}, r2: {} };
        }

        function renderQuotaBar(label, used, limit, formatter) {
            formatter = formatter || formatNumber;
            const percent = percentOf(used, limit);
            const color = getGradientColor(percent);
            return '<div class="quota-row">' +
                '<div class="quota-top">' +
                    '<span class="quota-title">' + label + '</span>' +
                    '<span class="quota-meta">' + formatter(used) + ' / ' + formatter(limit) + ' · ' + percent.toFixed(1) + '%</span>' +
                '</div>' +
                '<div class="quota-track"><div class="quota-fill" style="width:' + percent + '%; background:' + color + '"></div></div>' +
            '</div>';
        }

        function renderQuotaGroup(title, meta, rows) {
            return '<div class="quota-item">' +
                '<div class="quota-group-head">' +
                    '<span class="quota-group-title">' + title + '</span>' +
                    '<span class="quota-group-meta">' + meta + '</span>' +
                '</div>' +
                rows.join('') +
            '</div>';
        }

        function renderResourceQuotas(resources) {
            const d1 = resources.d1 || {};
            const kv = resources.kv || {};
            const r2 = resources.r2 || {};
            return '<details class="quota-details">' +
                '<summary class="quota-summary"><span class="quota-summary-title">资源额度细节</span><span class="quota-summary-meta">KV / D1 / R2</span></summary>' +
                '<div class="quota-body"><div class="quota-list">' +
                    renderQuotaGroup('KV', formatNumber(kv.namespaces || 0) + ' 个命名空间', [
                        renderQuotaBar('读取（今日）', kv.reads, kv.readsLimit),
                        renderQuotaBar('写入（今日）', kv.writes, kv.writesLimit),
                        renderQuotaBar('删除/列表（今日）', (kv.deletes || 0) + (kv.lists || 0), (kv.deletesLimit || 0) + (kv.listsLimit || 0)),
                        renderQuotaBar('存储', kv.storageBytes, kv.storageLimitBytes, formatBytes)
                    ]) +
                    renderQuotaGroup('D1', formatNumber(d1.databases || 0) + ' 个数据库', [
                        renderQuotaBar('读取（今日）', d1.rowsRead, d1.rowsReadLimit),
                        renderQuotaBar('写入（今日）', d1.rowsWritten, d1.rowsWrittenLimit),
                        renderQuotaBar('存储', d1.storageBytes, d1.storageLimitBytes, formatBytes)
                    ]) +
                    renderQuotaGroup('R2', formatNumber(r2.buckets || 0) + ' 个存储桶', [
                        renderQuotaBar('Class A（本月）', r2.classA, r2.classALimit),
                        renderQuotaBar('Class B（本月）', r2.classB, r2.classBLimit),
                        renderQuotaBar('存储', r2.storageBytes, r2.storageLimitBytes, formatBytes)
                    ]) +
                '</div><div class="resource-note">D1/KV 按 UTC 自然日统计，R2 操作按本月统计；存储为最近一次指标快照。</div></div>' +
            '</details>';
        }

        function prefersReducedMotion() {
            return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        }

        function isDesktopAdminView() {
            return window.matchMedia && window.matchMedia('(min-width: 1024px)').matches;
        }

        function resetQuotaBody(body) {
            body.style.height = '';
            body.style.opacity = '';
            body.style.transform = '';
            body.style.overflow = '';
        }

        function animateQuotaDetails(details, opening) {
            const body = details.querySelector('.quota-body');
            if (!body || typeof body.animate !== 'function') {
                details.open = opening;
                return;
            }

            details.classList.add('quota-animating');
            body.style.overflow = 'hidden';

            if (opening) {
                details.open = true;
                body.style.height = '0px';
                body.style.opacity = '0';
                body.style.transform = 'translateY(6px)';
            } else {
                body.style.height = body.scrollHeight + 'px';
                body.style.opacity = '1';
                body.style.transform = 'translateY(0)';
            }

            const startHeight = opening ? 0 : body.scrollHeight;
            const endHeight = opening ? body.scrollHeight : 0;
            const animation = body.animate([
                { height: startHeight + 'px', opacity: opening ? 0 : 1, transform: opening ? 'translateY(6px)' : 'translateY(0)' },
                { height: endHeight + 'px', opacity: opening ? 1 : 0, transform: opening ? 'translateY(0)' : 'translateY(6px)' }
            ], {
                duration: 260,
                easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                fill: 'forwards'
            });

            animation.onfinish = () => {
                animation.cancel();
                if (!opening) details.open = false;
                resetQuotaBody(body);
                details.classList.remove('quota-animating');
            };

            animation.oncancel = () => {
                resetQuotaBody(body);
                details.classList.remove('quota-animating');
            };
        }

        function bindQuotaDetailsAnimations(scope, defaultOpenOnDesktop = false) {
            if (!scope) return;
            scope.querySelectorAll('.quota-details').forEach(details => {
                if (details.dataset.quotaAnimationBound) return;
                const summary = details.querySelector('.quota-summary');
                const body = details.querySelector('.quota-body');
                if (!summary || !body) return;
                if (defaultOpenOnDesktop && isDesktopAdminView()) details.open = true;

                details.dataset.quotaAnimationBound = 'true';
                summary.addEventListener('click', (event) => {
                    if (prefersReducedMotion() || typeof body.animate !== 'function') return;
                    event.preventDefault();
                    if (details.classList.contains('quota-animating')) return;
                    animateQuotaDetails(details, !details.open);
                });
            });
        }

        async function logout() {
            try {
                await fetch('./api/logout', { method: 'POST' });
            } catch (err) {
                console.error('登出请求失败:', err);
            } finally {
                window.location.href = '/';
            }
        }

        async function fetchSummary() {
            const container = document.getElementById('summary-content');
            try {
                const res = await fetch('./admin/usage.json?t=' + Date.now());
                const data = await res.json();
                
                const total = data.total || 0;
                const max = data.max || 100000;
                const percent = Math.min((total / max) * 100, 100).toFixed(1);
                const resources = getResources(data);
                
                container.innerHTML = \`
                    <div class="usage-section">
                        <div class="usage-header">
                            <span class="label">总请求占比</span>
                            <span class="percentage">\${percent}%</span>
                        </div>
                        <div class="progress-track">
                            <div class="progress-bar" style="width: \${percent}%"></div>
                        </div>
                        <div class="total-text">
                            \${total.toLocaleString()} / \${max.toLocaleString()} 总计请求
                        </div>
                    </div>
                    <div class="stats-grid">
                        <div class="mini-card">
                            <div class="mini-icon">🔶</div>
                            <div class="mini-info">
                                <div class="mini-label">Workers</div>
                                <div class="mini-value">\${(data.workers || 0).toLocaleString()}</div>
                            </div>
                        </div>
                        <div class="mini-card">
                            <div class="mini-icon">⚡️</div>
                            <div class="mini-info">
                                <div class="mini-label">Pages</div>
                                <div class="mini-value">\${(data.pages || 0).toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                    \${renderResourceQuotas(resources)}
                \`;
                bindQuotaDetailsAnimations(container, true);
                
                // 应用颜色到百分数
                const usageSection = container.querySelector('.usage-section');
                applyGradientColor(usageSection, percent);
            } catch (err) {
                container.innerHTML = '<div style="color: var(--danger)">加载汇总数据失败</div>';
            }
        }

        async function fetchConfig() {
            const container = document.getElementById('config-content');
            try {
                const res = await fetch('./admin/config.json?t=' + Date.now());
                const data = await res.json();
                
                if (data.length === 0) {
                    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">暂无账号，请点击上方按钮添加</div>';
                    return;
                }

                container.innerHTML = '<div class="account-list">' + data.map(acc => {
                    const usage = acc.Usage || {};
                    const resources = getResources(usage);
                    const total = usage.total || 0;
                    const max = usage.max || 100000;
                    const percent = Math.min((total / max) * 100, 100).toFixed(1);
                    const updateTimeValue = acc.UpdateTime || acc.LastCheckTime;
                    const updateTime = updateTimeValue ? new Date(updateTimeValue).toLocaleString() : '从未更新';
                    const percentColor = getGradientColor(percent);
                    const bgSize = percent > 0 ? (100 / percent) * 100 : 100;
                    
                    return \`
                        <div class="account-item">
                            <div class="account-info">
                                <div>
                                    <div class="account-name">🔑 \${acc.Name}</div>
                                    <div class="account-id">\${acc.AccountID ? \`🔒 AccountID: \${acc.AccountID}\` : \`📧 Email: \${acc.Email}\`}</div>
                                    <div class="account-id" style="margin-top: 4px; opacity: 0.8;">🕒 更新时间: \${updateTime}</div>
                                </div>
                                <button class="delete-btn" onclick="deleteAccount(\${acc.ID})">删除账号</button>
                            </div>
                            <div class="usage-section" style="margin-bottom: 0">
                                <div class="usage-header">
                                    <span class="label">请求使用情况: \${total.toLocaleString()} / \${max.toLocaleString()} <b style="color: \${percentColor}; margin-left: 4px;">\${percent}%</b></span>
                                    <span class="label" style="font-size: 0.8rem; font-variant-numeric: tabular-nums;">
                                        W: \${(usage.workers || 0).toLocaleString()} | P: \${(usage.pages || 0).toLocaleString()}
                                    </span>
                                </div>
                                <div class="progress-track" style="height: 8px">
                                    <div class="progress-bar" style="width: \${percent}%; --bg-size: \${bgSize}%"></div>
                                </div>
                            </div>
                            \${renderResourceQuotas(resources)}
                        </div>
                    \`;
                }).join('') + '</div>';
                bindQuotaDetailsAnimations(container);
            } catch (err) {
                container.innerHTML = '<div style="color: var(--danger)">加载详情数据失败</div>';
            }
        }

        function openAddModal() { 
            document.getElementById('addModal').classList.add('active'); 
            document.getElementById('authMethod').value = 'token';
            switchAuthMethod();
        }

        function switchAuthMethod() {
            const method = document.getElementById('authMethod').value;
            document.getElementById('tokenFields').style.display = method === 'token' ? 'block' : 'none';
            document.getElementById('globalFields').style.display = method === 'global' ? 'block' : 'none';
        }

        function closeAddModal() { 
            document.getElementById('addModal').classList.remove('active');
            document.getElementById('newName').value = '';
            document.getElementById('newAccountID').value = '';
            document.getElementById('newAPIToken').value = '';
            document.getElementById('newEmail').value = '';
            document.getElementById('newGlobalAPIKey').value = '';
        }

        async function handleAddAccount() {
            const name = document.getElementById('newName').value;
            const method = document.getElementById('authMethod').value;
            
            let accountID = null, apiToken = null, email = null, globalAPIKey = null;

            if (method === 'token') {
                accountID = document.getElementById('newAccountID').value;
                apiToken = document.getElementById('newAPIToken').value;
                if (!name || !accountID || !apiToken) {
                    showToast('⚠️ 请填写完整信息');
                    return;
                }
            } else {
                email = document.getElementById('newEmail').value;
                globalAPIKey = document.getElementById('newGlobalAPIKey').value;
                if (!name || !email || !globalAPIKey) {
                    showToast('⚠️ 请填写完整信息');
                    return;
                }
            }

            try {
                const res = await fetch('./api/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        Name: name, 
                        AccountID: accountID, 
                        APIToken: apiToken,
                        Email: email,
                        GlobalAPIKey: globalAPIKey
                    })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('✅ 添加成功，正在更新数据...');
                    closeAddModal();
                    setTimeout(() => {
                        fetchSummary();
                        fetchConfig();
                    }, 1000);
                } else {
                    showToast('❌ ' + (data.msg || '添加失败'));
                }
            } catch (err) {
                showToast('❌ 网络错误');
            }
        }

        async function deleteAccount(id) {
            if (!confirm('确定要删除这个账号吗？')) return;
            
            try {
                const res = await fetch('./api/del', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ID: id })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('✅ 删除成功，正在更新数据...');
                    setTimeout(() => {
                        fetchSummary();
                        fetchConfig();
                    }, 1000);
                } else {
                    showToast('❌ ' + (data.msg || '删除失败'));
                }
            } catch (err) {
                showToast('❌ 网络错误');
            }
        }

        // 初始加载
        fetchSummary().then(() => fetchConfig());
    </script>
</body>
</html>`;
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8' } })
}


async function UsagePanel主页(TOKEN) {
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloudflare 额度使用统计</title>
    <link rel="icon" href="https://cf-assets.www.cloudflare.com/dzlvafdwdttg/5uhbWfhjepEoUiM9phzhgJ/9658369030266cde9e35a3c5d4e4beb2/cloud-upload.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #6366f1;
            --primary-glow: rgba(99, 102, 241, 0.4);
            --accent: #a855f7;
            --background: #0f172a;
            --card-bg: rgba(30, 41, 59, 0.7);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --stroke: rgba(255, 255, 255, 0.08);
            --heading-grad: linear-gradient(135deg, #fff 0%, #cbd5e1 100%);
            --footer-color: rgba(255, 255, 255, 0.2);
            --footer-hover: rgba(255, 255, 255, 0.4);
            --item-bg: rgba(255, 255, 255, 0.03);
            --track-bg: rgba(0, 0, 0, 0.2);
        }

        :root.light-mode {
            --primary: #4f46e5;
            --primary-glow: rgba(79, 70, 229, 0.2);
            --accent: #9333ea;
            --background: #f1f5f9;
            --card-bg: rgba(255, 255, 255, 0.8);
            --text-main: #0f172a;
            --text-muted: #64748b;
            --stroke: rgba(0, 0, 0, 0.1);
            --heading-grad: linear-gradient(135deg, #1e293b 0%, #475569 100%);
            --footer-color: rgba(15, 23, 42, 0.4);
            --footer-hover: var(--primary);
            --item-bg: rgba(0, 0, 0, 0.03);
            --track-bg: rgba(0, 0, 0, 0.08);
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        html {
            scrollbar-gutter: stable both-edges;
        }

        @supports not (scrollbar-gutter: stable) {
            html { overflow-y: scroll; }
        }

        body {
            font-family: 'Outfit', sans-serif;
            background-color: var(--background);
            background-image: 
                radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%),
                radial-gradient(at 100% 100%, rgba(168, 85, 247, 0.15) 0px, transparent 50%);
            background-attachment: fixed;
            color: var(--text-main);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 1.5rem;
        }

        .container {
            width: 100%;
            max-width: 500px;
            animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .glass-card {
            background: var(--card-bg);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 1px solid var(--stroke);
            border-radius: 24px;
            padding: 2.5rem;
            box-shadow: 
                0 25px 50px -12px rgba(0, 0, 0, 0.5),
                0 0 0 1px rgba(255, 255, 255, 0.05) inset;
        }

        header {
            text-align: center;
            margin-bottom: 2.5rem;
        }

        h1 {
            font-size: 1.5rem;
            font-weight: 700;
            background: var(--heading-grad);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            margin-bottom: 0.5rem;
            letter-spacing: -0.01em;
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: rgba(99, 102, 241, 0.1);
            border: 1px solid rgba(99, 102, 241, 0.2);
            border-radius: 99px;
            font-size: 0.75rem;
            color: #818cf8;
            font-weight: 500;
        }

        .status-dot {
            width: 6px;
            height: 6px;
            background: #818cf8;
            border-radius: 50%;
            box-shadow: 0 0 8px var(--primary);
            animation: statusPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @keyframes statusPulse {
            0%, 100% {
                box-shadow: 0 0 8px var(--primary), 0 0 0 0 rgba(129, 140, 248, 0.7);
                transform: scale(1);
            }
            50% {
                box-shadow: 0 0 12px var(--primary), 0 0 0 6px rgba(129, 140, 248, 0);
                transform: scale(1.2);
            }
        }

        .usage-section {
            margin-bottom: 2rem;
            position: relative;
        }

        .usage-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-bottom: 1rem;
        }

        .label {
            font-size: 0.9rem;
            color: var(--text-muted);
            font-weight: 500;
        }

        .percentage {
            font-family: 'Outfit', monospace;
            font-size: 1.25rem;
            font-weight: 600;
            color: var(--gradient-color, var(--text-main));
            text-shadow: 0 0 20px var(--gradient-color-shadow, var(--primary-glow));
            transition: color 0.6s ease, text-shadow 0.6s ease;
        }

        .progress-track {
            background: var(--track-bg);
            border: 1px solid var(--stroke);
            border-radius: 999px;
            height: 14px;
            overflow: hidden;
            position: relative;
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
        }

        .progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #10b981 0%, #eab308 50%, #ef4444 100%);
            background-size: var(--bg-size, 100%);
            background-position: left;
            border-radius: 999px;
            width: 0%;
            transition: width 1.5s cubic-bezier(0.34, 1.56, 0.64, 1);
            position: relative;
            overflow: hidden;
        }
        
        .progress-bar::after {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
            transform: translateX(-100%);
            animation: shimmer 2.5s infinite;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
            margin-top: 1.5rem;
        }

        .mini-card { 
            background: var(--item-bg); 
            border: 1px solid var(--stroke); 
            border-radius: 16px; 
            padding: 1rem 1.25rem; 
            display: flex; 
            align-items: center; 
            gap: 1.25rem;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
            position: relative;
            overflow: hidden;
        }
        .mini-card:hover { 
            background: rgba(99, 102, 241, 0.08); 
            transform: translateY(-4px); 
            border-color: var(--primary); 
            box-shadow: 0 10px 20px -5px rgba(0, 0, 0, 0.2);
        }
        .mini-icon { 
            font-size: 1.75rem; 
            margin-bottom: 0; 
            line-height: 1;
            filter: drop-shadow(0 0 10px rgba(255,255,255,0.1));
        }
        .mini-info { display: flex; flex-direction: column; justify-content: center; }
        .mini-label { 
            font-size: 0.7rem; 
            text-transform: uppercase; 
            letter-spacing: 0.05em;
            color: var(--text-muted); 
            margin-bottom: 0; 
            font-weight: 500;
        }
        .mini-value { 
            font-size: 1.25rem; 
            font-weight: 700; 
            color: var(--text-main); 
            line-height: 1.2;
        }

        .total-text {
            text-align: right;
            font-size: 0.8rem;
            color: var(--text-muted);
            margin-top: 0.5rem;
            font-variant-numeric: tabular-nums;
        }

        .quota-details { margin-top: 1.25rem; overflow: hidden; }
        .quota-details[open] { display: flex; flex-direction: column; }
        .quota-details.quota-animating .quota-summary { pointer-events: none; }
        .quota-summary { list-style: none; background: linear-gradient(135deg, rgba(99, 102, 241, 0.16), rgba(14, 165, 233, 0.1)); border: 1px solid rgba(99, 102, 241, 0.5); border-radius: 14px; padding: 0.8rem 0.85rem; cursor: pointer; display: flex; justify-content: space-between; gap: 0.75rem; align-items: center; color: var(--text-main); font-size: 0.85rem; font-weight: 700; box-shadow: 0 12px 28px -18px var(--primary-glow), inset 0 1px 0 rgba(255,255,255,0.08); transition: all 0.3s ease; }
        .quota-summary::-webkit-details-marker { display: none; }
        .quota-summary:hover, .quota-summary:focus-visible { border-color: var(--primary); background: linear-gradient(135deg, rgba(99, 102, 241, 0.24), rgba(14, 165, 233, 0.14)); box-shadow: 0 16px 32px -18px var(--primary-glow), 0 0 0 3px rgba(99, 102, 241, 0.12); outline: none; }
        .quota-summary-title { min-width: 0; }
        .quota-summary::after { content: '展开细节'; color: #fff; background: var(--primary); border-radius: 999px; padding: 0.38rem 0.7rem; font-size: 0.75rem; font-weight: 700; white-space: nowrap; box-shadow: 0 10px 20px -12px var(--primary-glow); }
        .quota-details[open] .quota-summary::after { content: '收起细节'; }
        .quota-details[open] .quota-summary { order: 2; margin-top: 0.875rem; }
        .quota-summary-meta { color: var(--text-muted); font-size: 0.75rem; font-weight: 600; margin-left: auto; white-space: nowrap; }
        .quota-body { overflow: hidden; }
        .quota-details[open] .quota-body { order: 1; }
        .quota-details.quota-animating .quota-body { will-change: height, opacity, transform; }
        .quota-list { display: grid; gap: 0.875rem; margin-top: 0.875rem; }
        .quota-details[open] .quota-list { margin-top: 0; }
        .quota-item { background: var(--item-bg); border: 1px solid var(--stroke); border-radius: 14px; padding: 0.875rem 1rem; }
        .quota-group-head { display: flex; justify-content: space-between; gap: 0.75rem; align-items: center; margin-bottom: 0.75rem; }
        .quota-group-title { color: var(--text-main); font-size: 0.9rem; font-weight: 700; }
        .quota-group-meta { color: var(--text-muted); font-size: 0.75rem; font-variant-numeric: tabular-nums; text-align: right; }
        .quota-row { margin-top: 0.75rem; }
        .quota-group-head + .quota-row { margin-top: 0; }
        .quota-top { display: flex; justify-content: space-between; gap: 0.75rem; color: var(--text-muted); font-size: 0.78rem; margin-bottom: 0.55rem; }
        .quota-title { color: var(--text-main); font-weight: 600; }
        .quota-meta { text-align: right; font-variant-numeric: tabular-nums; }
        .quota-track { height: 7px; background: var(--track-bg); border: 1px solid var(--stroke); border-radius: 999px; overflow: hidden; }
        .quota-fill { height: 100%; border-radius: inherit; min-width: 0; transition: width 1s ease; }
        .resource-note { margin-top: 0.875rem; color: var(--text-muted); font-size: 0.75rem; line-height: 1.5; }

        .footer {
            margin-top: 2.5rem;
            text-align: center;
            font-size: 0.75rem;
            color: var(--footer-color);
            transition: color 0.3s;
        }
        
        .footer:hover {
            color: var(--footer-hover);
        }

        /* 管理员登录气泡 */
        .admin-bubble {
            position: fixed;
            top: 1.5rem;
            right: 1.5rem;
            width: 48px;
            height: 48px;
            background: linear-gradient(135deg, var(--primary), var(--accent));
            border-radius: 50%;
            display: flex;
            justify-content: center;
            align-items: center;
            cursor: pointer;
            box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4);
            transition: all 0.3s ease;
            z-index: 1001;
        }

        .admin-bubble:hover {
            transform: scale(1.1);
            box-shadow: 0 12px 32px rgba(99, 102, 241, 0.5);
        }

        .admin-bubble svg {
            width: 24px;
            height: 24px;
            fill: white;
        }

        /* 登录模态框 */
        .login-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            display: none;
            justify-content: center;
            align-items: center;
            z-index: 2000;
            animation: fadeIn 0.3s ease;
        }

        .login-modal-overlay.active {
            display: flex;
        }

        .login-modal {
            background: var(--card-bg);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 1px solid var(--stroke);
            border-radius: 20px;
            padding: 2rem;
            max-width: 360px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            animation: modalSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes modalSlideUp {
            from { opacity: 0; transform: translateY(30px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .login-modal h2 {
            font-size: 1.25rem;
            font-weight: 600;
            margin-bottom: 1.5rem;
            text-align: center;
            background: var(--heading-grad);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
        }

        .login-input {
            width: 100%;
            padding: 0.875rem 1rem;
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            color: var(--text-main);
            font-size: 1rem;
            font-family: 'Outfit', sans-serif;
            outline: none;
            transition: all 0.3s ease;
            margin-bottom: 1rem;
        }

        .login-input:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
        }

        .login-input::placeholder {
            color: var(--text-muted);
        }

        :root.light-mode .login-input {
            background: rgba(79, 70, 229, 0.08);
            border-color: rgba(79, 70, 229, 0.2);
        }

        :root.light-mode .login-input:focus {
            box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
        }

        .login-btn {
            width: 100%;
            padding: 0.875rem;
            background: linear-gradient(135deg, var(--primary), var(--accent));
            border: none;
            border-radius: 12px;
            color: white;
            font-size: 1rem;
            font-weight: 600;
            font-family: 'Outfit', sans-serif;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .login-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4);
        }

        :root.light-mode .login-btn:hover {
            box-shadow: 0 8px 24px rgba(79, 70, 229, 0.35);
        }

        .login-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        .login-error {
            background: rgba(239, 68, 68, 0.15);
            color: #fca5a5;
            padding: 0.75rem 1rem;
            border-radius: 10px;
            font-size: 0.85rem;
            margin-bottom: 1rem;
            border: 1px solid rgba(239, 68, 68, 0.2);
            text-align: center;
            display: none;
        }

        .login-error.show {
            display: block;
            animation: shake 0.4s ease;
        }

        :root.light-mode .login-error {
            background: rgba(239, 68, 68, 0.08);
            color: #dc2626;
            border-color: rgba(239, 68, 68, 0.3);
        }

        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-8px); }
            75% { transform: translateX(8px); }
        }

        .close-modal {
            position: absolute;
            top: 1rem;
            right: 1rem;
            width: 32px;
            height: 32px;
            background: rgba(255, 255, 255, 0.1);
            border: none;
            border-radius: 50%;
            color: var(--text-muted);
            font-size: 1.25rem;
            cursor: pointer;
            display: flex;
            justify-content: center;
            align-items: center;
            transition: all 0.3s ease;
        }

        .close-modal:hover {
            background: rgba(255, 255, 255, 0.2);
            color: white;
        }

        .login-modal-wrapper {
            position: relative;
        }

        .toast-notification {
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            background: linear-gradient(135deg, rgba(168, 85, 247, 0.95), rgba(99, 102, 241, 0.95));
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 1px solid rgba(168, 85, 247, 0.5);
            border-radius: 12px;
            padding: 1.25rem 1.5rem;
            color: #fff;
            font-size: 0.95rem;
            font-weight: 500;
            box-shadow: 0 15px 35px rgba(168, 85, 247, 0.3), 0 0 1px rgba(255,255,255,0.1) inset;
            animation: toastSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            z-index: 1000;
            max-width: 300px;
            word-break: break-word;
        }

        @keyframes toastSlideIn {
            from { opacity: 0; transform: translateX(30px) translateY(30px); }
            to { opacity: 1; transform: translateX(0) translateY(0); }
        }

        .loading-container {
            min-height: 200px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            gap: 1rem;
        }

        .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            border-top-color: var(--primary);
            animation: spin 1s ease-in-out infinite;
        }

        .error-msg {
            background: rgba(239, 68, 68, 0.15);
            color: #fca5a5;
            padding: 1rem;
            border-radius: 12px;
            font-size: 0.9rem;
            border: 1px solid rgba(239, 68, 68, 0.2);
            text-align: center;
        }

        /* 主题切换气泡 */
        .theme-bubble {
            position: fixed;
            top: 1.5rem;
            left: 1.5rem;
            width: 48px;
            height: 48px;
            background: var(--card-bg);
            backdrop-filter: blur(12px);
            border: 1px solid var(--stroke);
            border-radius: 50%;
            display: flex;
            justify-content: center;
            align-items: center;
            cursor: pointer;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
            transition: all 0.3s ease;
            z-index: 1001;
            color: var(--text-main);
        }

        .theme-bubble:hover {
            transform: scale(1.1);
            border-color: var(--primary);
        }

        .theme-bubble svg { width: 22px; height: 22px; stroke: currentColor; }

        @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        @keyframes shimmer {
            100% { transform: translateX(100%); }
        }

        /* ============ 移动端响应式优化 ============ */
        @media (max-width: 768px) {
            body {
                padding: 1rem;
            }

            .container {
                max-width: 100%;
            }

            .glass-card {
                padding: 1.5rem;
                border-radius: 20px;
            }

            header {
                margin-bottom: 2rem;
            }

            h1 {
                font-size: 1.25rem;
                margin-bottom: 0.75rem;
            }

            .status-badge {
                padding: 5px 10px;
                font-size: 0.7rem;
                gap: 4px;
            }

            .status-dot {
                width: 5px;
                height: 5px;
            }

            .usage-section {
                margin-bottom: 1.5rem;
            }

            .usage-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 0.5rem;
                margin-bottom: 0.75rem;
            }

            .label {
                font-size: 0.85rem;
            }

            .percentage {
                font-size: 1.1rem;
            }

            .progress-track {
                height: 12px;
            }

            .stats-grid {
                grid-template-columns: 1fr;
                gap: 0.75rem;
                margin-top: 1.25rem;
            }

            .mini-card {
                padding: 0.875rem 1rem;
                gap: 1rem;
            }

            .mini-icon {
                font-size: 1.5rem;
            }

            .mini-label {
                font-size: 0.65rem;
            }

            .mini-value {
                font-size: 1.1rem;
            }

            .total-text {
                font-size: 0.75rem;
                margin-top: 0.375rem;
            }

            .quota-top {
                flex-direction: column;
                gap: 0.35rem;
            }

            .quota-summary, .quota-group-head {
                align-items: flex-start;
                flex-direction: column;
                gap: 0.35rem;
            }

            .quota-summary-meta {
                margin-left: 0;
            }

            .quota-group-meta {
                text-align: left;
            }

            .quota-meta {
                text-align: left;
            }

            .footer {
                margin-top: 2rem;
                font-size: 0.7rem;
            }

            .theme-bubble {
                top: 1rem;
                left: 1rem;
                width: 44px;
                height: 44px;
            }

            .theme-bubble svg {
                width: 20px;
                height: 20px;
            }

            .admin-bubble {
                top: 1rem;
                right: 1rem;
                width: 44px;
                height: 44px;
            }

            .admin-bubble svg {
                width: 22px;
                height: 22px;
            }

            .login-modal {
                max-width: calc(100% - 2rem);
                padding: 1.5rem;
                border-radius: 18px;
            }

            .login-modal h2 {
                font-size: 1.1rem;
                margin-bottom: 1.25rem;
            }

            .login-input {
                padding: 0.75rem 0.875rem;
                font-size: 0.95rem;
                margin-bottom: 0.875rem;
                border-radius: 10px;
            }

            .login-btn {
                padding: 0.75rem 1rem;
                font-size: 0.95rem;
                border-radius: 10px;
            }

            .close-modal {
                width: 28px;
                height: 28px;
                font-size: 1.1rem;
                top: 0.75rem;
                right: 0.75rem;
            }

            .login-error {
                padding: 0.65rem 0.875rem;
                font-size: 0.8rem;
                border-radius: 8px;
                margin-bottom: 0.875rem;
            }

            .toast-notification {
                bottom: 1.5rem;
                right: 1rem;
                left: 1rem;
                padding: 1rem 1.25rem;
                font-size: 0.875rem;
                border-radius: 10px;
            }

            .loading-container {
                min-height: 150px;
                gap: 0.75rem;
            }

            .spinner {
                width: 36px;
                height: 36px;
                border-width: 2px;
            }

            .error-msg {
                padding: 0.875rem;
                font-size: 0.85rem;
                border-radius: 10px;
            }
        }

        /* 超小屏幕优化 (max-width: 480px) */
        @media (max-width: 480px) {
            body {
                padding: 0.75rem;
                min-height: 100vh;
            }

            .container {
                max-width: 100%;
            }

            .glass-card {
                padding: 1.25rem;
                border-radius: 16px;
                box-shadow: 
                    0 15px 30px -8px rgba(0, 0, 0, 0.5),
                    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
            }

            header {
                margin-bottom: 1.5rem;
            }

            h1 {
                font-size: 1.15rem;
                margin-bottom: 0.5rem;
            }

            .status-badge {
                padding: 4px 8px;
                font-size: 0.65rem;
                gap: 3px;
            }

            .usage-section {
                margin-bottom: 1.25rem;
            }

            .usage-header {
                gap: 0.25rem;
                margin-bottom: 0.625rem;
            }

            .label {
                font-size: 0.8rem;
            }

            .percentage {
                font-size: 1rem;
            }

            .progress-track {
                height: 10px;
                border-radius: 999px;
            }

            .stats-grid {
                gap: 0.5rem;
                margin-top: 1rem;
            }

            .mini-card {
                padding: 0.75rem 0.875rem;
                gap: 0.875rem;
            }

            .mini-card:hover {
                transform: translateY(-2px);
            }

            .mini-icon {
                font-size: 1.4rem;
            }

            .mini-label {
                font-size: 0.6rem;
                letter-spacing: 0.03em;
            }

            .mini-value {
                font-size: 1rem;
            }

            .total-text {
                font-size: 0.7rem;
            }

            .footer {
                margin-top: 1.5rem;
                font-size: 0.65rem;
            }

            .theme-bubble, .admin-bubble {
                width: 40px;
                height: 40px;
                top: 0.75rem;
            }

            .theme-bubble {
                left: 0.75rem;
            }

            .admin-bubble {
                right: 0.75rem;
            }

            .theme-bubble svg, .admin-bubble svg {
                width: 18px;
                height: 18px;
            }

            .login-modal-overlay {
                padding: 1rem;
            }

            .login-modal {
                max-width: 100%;
                width: 100%;
                padding: 1.25rem;
                border-radius: 16px;
            }

            .login-modal h2 {
                font-size: 1rem;
                margin-bottom: 1rem;
            }

            .login-input {
                padding: 0.65rem 0.75rem;
                font-size: 0.9rem;
                margin-bottom: 0.75rem;
                border-radius: 8px;
            }

            .login-input::placeholder {
                font-size: 0.9rem;
            }

            .login-btn {
                padding: 0.65rem 0.875rem;
                font-size: 0.9rem;
            }

            .close-modal {
                width: 26px;
                height: 26px;
                font-size: 1rem;
                top: 0.5rem;
                right: 0.5rem;
            }

            .login-error {
                padding: 0.6rem 0.75rem;
                font-size: 0.75rem;
                margin-bottom: 0.75rem;
            }

            .toast-notification {
                bottom: 1rem;
                right: 0.75rem;
                left: 0.75rem;
                padding: 0.875rem 1rem;
                font-size: 0.8rem;
                max-width: 100%;
            }

            .loading-container {
                min-height: 120px;
                gap: 0.5rem;
            }

            .spinner {
                width: 32px;
                height: 32px;
                border-width: 2px;
            }

            .error-msg {
                padding: 0.75rem;
                font-size: 0.8rem;
            }
        }

        /* 竖屏超大手机优化 (min-height: 800px) */
        @media (min-height: 800px) and (max-width: 768px) {
            body {
                justify-content: flex-start;
                padding-top: 3rem;
                padding-bottom: 2rem;
            }

            .container {
                margin: 0 auto;
            }
        }
    </style>
</head>
<body>
    <!-- 主题切换气泡 -->
    <div class="theme-bubble" onclick="toggleTheme()" title="切换显示模式">
        <svg id="sun-icon" style="display:none" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="18.36" x2="5.64" y2="19.78"></line><line x1="18.36" y1="4.22" x2="19.78" y2="5.64"></line></svg>
        <svg id="moon-icon" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
    </div>

    <!-- 管理员登录气泡 -->
    <div class="admin-bubble" onclick="openLoginModal()" title="管理员登录">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
    </div>

    <!-- 登录模态框 -->
    <div class="login-modal-overlay" id="loginModal">
        <div class="login-modal-wrapper">
            <div class="login-modal">
                <button class="close-modal" onclick="closeLoginModal()">&times;</button>
                <h2>🔐 管理员登录</h2>
                <div class="login-error" id="loginError"></div>
                <input type="text" class="login-input" id="adminUsername" placeholder="请输入管理员账号" onkeydown="if(event.key==='Enter')document.getElementById('adminPassword').focus()">
                <input type="password" class="login-input" id="adminPassword" placeholder="请输入管理员密码" onkeydown="if(event.key==='Enter')handleLogin()">
                <button class="login-btn" id="loginBtn" onclick="handleLogin()">登 录</button>
            </div>
        </div>
    </div>

    <div class="container">
        <div class="glass-card">
            <header>
                <h1>☁️ Cloudflare 额度统计</h1>
                <div class="status-badge">
                    <div class="status-dot"></div>
                    <span>System Online</span>
                </div>
            </header>

            <div id="content">
                <div class="loading-container">
                    <div class="spinner"></div>
                    <div style="color: var(--text-muted); font-size: 0.9rem;">正在获取数据...</div>
                </div>
            </div>

            <div class="footer">
                由 <a href="https://github.com/cmliu/CF-Workers-UsagePanel" target="_blank" rel="noopener" class="footer">CF-Workers-UsagePanel</a> 强力驱动
            </div>
        </div>
    </div>

    <script>
        function initTheme() {
            const savedTheme = localStorage.getItem('theme');
            const systemLight = window.matchMedia('(prefers-color-scheme: light)').matches;
            if (savedTheme === 'light' || (!savedTheme && systemLight)) {
                document.documentElement.classList.add('light-mode');
            }
            updateThemeIcons();
        }

        function toggleTheme() {
            const isLight = document.documentElement.classList.toggle('light-mode');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
            updateThemeIcons();
        }

        function updateThemeIcons() {
            const isLight = document.documentElement.classList.contains('light-mode');
            document.getElementById('sun-icon').style.display = isLight ? 'none' : 'block';
            document.getElementById('moon-icon').style.display = isLight ? 'block' : 'none';
        }

        initTheme();

        // 根据百分比计算颜色（绿 -> 黄 -> 红）
        function getGradientColor(percent) {
            percent = Math.max(0, Math.min(100, percent));
            
            let r, g, b;
            
            if (percent <= 50) {
                // 绿色 (16, 185, 129) 到 黄色 (234, 179, 8)
                const t = percent / 50;
                r = Math.round(16 + (234 - 16) * t);
                g = Math.round(185 + (179 - 185) * t);
                b = Math.round(129 - 129 * t);
            } else {
                // 黄色 (234, 179, 8) 到 红色 (239, 68, 68)
                const t = (percent - 50) / 50;
                r = Math.round(234 + (239 - 234) * t);
                g = Math.round(179 - 179 * t);
                b = Math.round(8 + (68 - 8) * t);
            }
            
            return \`rgb(\${r}, \${g}, \${b})\`;
        }

        // 获取对应百分比的色阴影
        function getGradientShadow(percent) {
            const color = getGradientColor(percent);
            const rgb = color.match(/\\d+/g);
            return \`rgba(\${rgb[0]}, \${rgb[1]}, \${rgb[2]}, 0.4)\`;
        }

        // 应用颜色到进度条容器
        function applyGradientColor(container, percent) {
            const color = getGradientColor(percent);
            const shadow = getGradientShadow(percent);
            container.style.setProperty('--gradient-color', color);
            container.style.setProperty('--gradient-color-shadow', \`0 0 20px \${shadow}\`);
            
            // 设置进度条背景大小，让渐变正确显示
            const bar = container.querySelector('.progress-bar');
            if (bar && percent > 0) {
                const bgSize = (100 / percent) * 100;
                bar.style.setProperty('--bg-size', \`\${bgSize}%\`);
            }
        }

        function percentOf(used, limit) {
            used = Number(used) || 0;
            limit = Number(limit) || 0;
            return limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
        }

        function formatNumber(value) {
            return (Number(value) || 0).toLocaleString();
        }

        function formatBytes(bytes) {
            bytes = Number(bytes) || 0;
            if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
            if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
            if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
            return bytes.toLocaleString() + ' B';
        }

        function getResources(data) {
            return (data && data.resources) || { d1: {}, kv: {}, r2: {} };
        }

        function renderQuotaBar(label, used, limit, formatter) {
            formatter = formatter || formatNumber;
            const percent = percentOf(used, limit);
            const color = getGradientColor(percent);
            return '<div class="quota-row">' +
                '<div class="quota-top">' +
                    '<span class="quota-title">' + label + '</span>' +
                    '<span class="quota-meta">' + formatter(used) + ' / ' + formatter(limit) + ' · ' + percent.toFixed(1) + '%</span>' +
                '</div>' +
                '<div class="quota-track"><div class="quota-fill" style="width:' + percent + '%; background:' + color + '"></div></div>' +
            '</div>';
        }

        function renderQuotaGroup(title, meta, rows) {
            return '<div class="quota-item">' +
                '<div class="quota-group-head">' +
                    '<span class="quota-group-title">' + title + '</span>' +
                    '<span class="quota-group-meta">' + meta + '</span>' +
                '</div>' +
                rows.join('') +
            '</div>';
        }

        function renderResourceQuotas(resources) {
            const d1 = resources.d1 || {};
            const kv = resources.kv || {};
            const r2 = resources.r2 || {};
            return '<details class="quota-details">' +
                '<summary class="quota-summary"><span class="quota-summary-title">资源额度细节</span><span class="quota-summary-meta">KV / D1 / R2</span></summary>' +
                '<div class="quota-body"><div class="quota-list">' +
                    renderQuotaGroup('KV', formatNumber(kv.namespaces || 0) + ' 个命名空间', [
                        renderQuotaBar('读取（今日）', kv.reads, kv.readsLimit),
                        renderQuotaBar('写入（今日）', kv.writes, kv.writesLimit),
                        renderQuotaBar('删除/列表（今日）', (kv.deletes || 0) + (kv.lists || 0), (kv.deletesLimit || 0) + (kv.listsLimit || 0)),
                        renderQuotaBar('存储', kv.storageBytes, kv.storageLimitBytes, formatBytes)
                    ]) +
                    renderQuotaGroup('D1', formatNumber(d1.databases || 0) + ' 个数据库', [
                        renderQuotaBar('读取（今日）', d1.rowsRead, d1.rowsReadLimit),
                        renderQuotaBar('写入（今日）', d1.rowsWritten, d1.rowsWrittenLimit),
                        renderQuotaBar('存储', d1.storageBytes, d1.storageLimitBytes, formatBytes)
                    ]) +
                    renderQuotaGroup('R2', formatNumber(r2.buckets || 0) + ' 个存储桶', [
                        renderQuotaBar('Class A（本月）', r2.classA, r2.classALimit),
                        renderQuotaBar('Class B（本月）', r2.classB, r2.classBLimit),
                        renderQuotaBar('存储', r2.storageBytes, r2.storageLimitBytes, formatBytes)
                    ]) +
                '</div><div class="resource-note">D1/KV 按 UTC 自然日统计，R2 操作按本月统计；存储为最近一次指标快照。</div></div>' +
            '</details>';
        }

        function prefersReducedMotion() {
            return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        }

        function resetQuotaBody(body) {
            body.style.height = '';
            body.style.opacity = '';
            body.style.transform = '';
            body.style.overflow = '';
        }

        function animateQuotaDetails(details, opening) {
            const body = details.querySelector('.quota-body');
            if (!body || typeof body.animate !== 'function') {
                details.open = opening;
                return;
            }

            details.classList.add('quota-animating');
            body.style.overflow = 'hidden';

            if (opening) {
                details.open = true;
                body.style.height = '0px';
                body.style.opacity = '0';
                body.style.transform = 'translateY(6px)';
            } else {
                body.style.height = body.scrollHeight + 'px';
                body.style.opacity = '1';
                body.style.transform = 'translateY(0)';
            }

            const startHeight = opening ? 0 : body.scrollHeight;
            const endHeight = opening ? body.scrollHeight : 0;
            const animation = body.animate([
                { height: startHeight + 'px', opacity: opening ? 0 : 1, transform: opening ? 'translateY(6px)' : 'translateY(0)' },
                { height: endHeight + 'px', opacity: opening ? 1 : 0, transform: opening ? 'translateY(0)' : 'translateY(6px)' }
            ], {
                duration: 260,
                easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                fill: 'forwards'
            });

            animation.onfinish = () => {
                animation.cancel();
                if (!opening) details.open = false;
                resetQuotaBody(body);
                details.classList.remove('quota-animating');
            };

            animation.oncancel = () => {
                resetQuotaBody(body);
                details.classList.remove('quota-animating');
            };
        }

        function bindQuotaDetailsAnimations(scope) {
            if (!scope) return;
            scope.querySelectorAll('.quota-details').forEach(details => {
                if (details.dataset.quotaAnimationBound) return;
                const summary = details.querySelector('.quota-summary');
                const body = details.querySelector('.quota-body');
                if (!summary || !body) return;

                details.dataset.quotaAnimationBound = 'true';
                summary.addEventListener('click', (event) => {
                    if (prefersReducedMotion() || typeof body.animate !== 'function') return;
                    event.preventDefault();
                    if (details.classList.contains('quota-animating')) return;
                    animateQuotaDetails(details, !details.open);
                });
            });
        }

        async function fetchUsage() {
            const content = document.getElementById('content');
            try {
                const start = Date.now();
                const response = await fetch('./usage.json?token=${TOKEN}&t=' + start);
                const data = await response.json();
                
                // Artificially wait a bit for smooth UX if too fast
                const elapsed = Date.now() - start;
                if (elapsed < 600) await new Promise(r => setTimeout(r, 600 - elapsed));
                
                if (!data.success && typeof data.total === 'undefined') {
                    throw new Error('No Data Available');
                }

                const total = data.total || 0;
                const max = data.max || 100000;
                const percent = Math.min((total / max) * 100, 100).toFixed(1);
                const resources = getResources(data);
                
                content.innerHTML = \`
                    <div class="usage-section">
                        <div class="usage-header">
                            <span class="label">总配额</span>
                            <span class="percentage">\${percent}%</span>
                        </div>
                        <div class="progress-track">
                            <div class="progress-bar" style="width: 0%"></div>
                        </div>
                        <div class="total-text">
                            \${total.toLocaleString()} / \${max.toLocaleString()} 请求次数
                        </div>
                    </div>

                    <div class="stats-grid">
                        <div class="mini-card">
                            <div class="mini-icon">🔶</div>
                            <div class="mini-info">
                                <div class="mini-label">Workers</div>
                                <div class="mini-value">\${(data.workers || 0).toLocaleString()}</div>
                            </div>
                        </div>
                        <div class="mini-card">
                            <div class="mini-icon">⚡️</div>
                            <div class="mini-info">
                                <div class="mini-label">Pages</div>
                                <div class="mini-value">\${(data.pages || 0).toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                    \${renderResourceQuotas(resources)}
                \`;
                bindQuotaDetailsAnimations(content);

                // Animate progress bar and apply colors
                requestAnimationFrame(() => {
                    const usageSection = content.querySelector('.usage-section');
                    const bar = content.querySelector('.progress-bar');
                    if(usageSection) applyGradientColor(usageSection, percent);
                    if(bar) bar.style.width = percent + '%';
                });

            } catch (error) {
                console.error(error);
                content.innerHTML = \`
                    <div class="error-msg">
                        <div style="margin-bottom: 0.25rem; font-weight: 600;">数据获取失败</div>
                        <div style="font-size: 0.8rem; opacity: 0.8;">\${error.message || '未知错误'}</div>
                    </div>
                \`;
            }
        }
        
        fetchUsage();

        // 管理员登录相关函数
        function openLoginModal() {
            document.getElementById('loginModal').classList.add('active');
            document.getElementById('adminUsername').focus();
        }

        function closeLoginModal() {
            document.getElementById('loginModal').classList.remove('active');
            document.getElementById('adminUsername').value = '';
            document.getElementById('adminPassword').value = '';
            document.getElementById('loginError').classList.remove('show');
        }

        // 点击模态框外部关闭
        document.getElementById('loginModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeLoginModal();
            }
        });

        // ESC键关闭模态框
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeLoginModal();
            }
        });

        async function handleLogin() {
            const username = document.getElementById('adminUsername').value || 'admin';
            const password = document.getElementById('adminPassword').value;
            const loginBtn = document.getElementById('loginBtn');
            const errorDiv = document.getElementById('loginError');

            if (!password) {
                errorDiv.textContent = '请输入密码';
                errorDiv.classList.add('show');
                document.getElementById('adminPassword').focus();
                return;
            }

            loginBtn.disabled = true;
            loginBtn.textContent = '登录中...';
            errorDiv.classList.remove('show');

            try {
                const response = await fetch('./api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (data.success) {
                    // 登录成功，跳转到管理面板
                    window.location.href = './admin';
                } else {
                    errorDiv.textContent = data.msg || '登录失败';
                    errorDiv.classList.add('show');
                    document.getElementById('adminUsername').select();
                }
            } catch (err) {
                errorDiv.textContent = '网络错误，请重试';
                errorDiv.classList.add('show');
            } finally {
                loginBtn.disabled = false;
                loginBtn.textContent = '登 录';
            }
        }

        // 1秒后显示消息气泡
        setTimeout(() => {
            fetch('./usage.json?token=${TOKEN}&t=' + Date.now())
                .then(r => r.json())
                .then(data => {
                    const msgElement = document.createElement('div');
                    msgElement.className = 'toast-notification';
                    msgElement.textContent = data.msg || '加载成功';
                    document.body.appendChild(msgElement);
                    
                    // 3秒后自动消失
                    setTimeout(() => {
                        msgElement.style.opacity = '0';
                        msgElement.style.transition = 'opacity 0.4s ease';
                        setTimeout(() => msgElement.remove(), 400);
                    }, 3000);
                })
                .catch(err => {
                    console.error('无法获取消息:', err);
                });
        }, 1000);
    </script>
</body>
</html>`;
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8' } })
}
