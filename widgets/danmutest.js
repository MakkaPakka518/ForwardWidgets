WidgetMetadata = {
    id: "danmu_fetcher_fix",
    title: "弹幕获取器 (修复版)",
    author: "MakkaPakka",
    description: "修复弹幕获取失败问题，支持多源聚合与繁简转换。",
    version: "1.0.2",
    requiredVersion: "0.0.1",
    modules: [
        {
            title: "获取弹幕",
            functionName: "getCommentsById",
            type: "danmu", // 确认为弹幕类型
            cacheDuration: 0,
            params: [] // 由播放器自动传入参数
        }
    ]
};

async function getCommentsById(params) {
    const { commentId } = params;
    // 假设 getServersFromParams 是外部定义的，如果未定义，这里提供一个默认空数组防止报错
    // 实际使用时，Forward 播放器环境通常会注入这个上下文，或者是你自己代码里的其他部分
    // 如果没有这个函数，你需要告诉我它的逻辑，或者我帮你写一个通用的
    const servers = typeof getServersFromParams === 'function' ? getServersFromParams(params) : [];

    if (!commentId) return null;
    if (!servers || servers.length === 0) return null;

    const headers = {
        "Content-Type": "application/json",
        "User-Agent": "ForwardWidgets/1.0.0"
    };

    // 1. 并发请求所有服务器
    const tasks = servers.map(async (server) => {
        try {
            // 关键：保留 chConvert=1 以支持繁简转换
            const url = `${server}/api/v2/comment/${commentId}?withRelated=true&chConvert=1`;
            const res = await Widget.http.get(url, { headers });
            
            let data = res.data;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch(e) {}
            }
            return data;
        } catch (e) {
            console.error(`Danmu fetch error: ${e.message}`);
            return null;
        }
    });

    const results = await Promise.all(tasks);

    // 2. 数据合并与去重
    let baseStructure = null; 
    const allDanmakus = [];
    const seen = new Set();

    results.forEach((data) => {
        if (!data) return;

        // 保留第一个成功的响应结构
        if (!baseStructure && (data.danmakus || data.comments)) {
            baseStructure = data;
        }

        // 兼容 danmakus 和 comments 字段
        const list = Array.isArray(data.danmakus) ? data.danmakus : 
                     (Array.isArray(data.comments) ? data.comments : []);

        if (!list || list.length === 0) return;

        list.forEach((d) => {
            // 生成唯一指纹，防止重复
            const key = (d.cid !== undefined ? `cid:${d.cid}` : "") || 
                        (d.id !== undefined ? `id:${d.id}` : "") || 
                        `mix:${d.time || d.p || ""}#${d.text || d.m || ""}`;
            
            if (seen.has(key)) return;
            seen.add(key);
            allDanmakus.push(d);
        });
    });

    // 3. 返回结果
    if (!baseStructure && allDanmakus.length === 0) {
        return null; 
    }

    if (!baseStructure) {
        baseStructure = { code: 0 };
    }

    // 统一回填到 danmakus 字段
    baseStructure.danmakus = allDanmakus;
    
    // 清理旧字段
    if (baseStructure.comments) delete baseStructure.comments;

    return baseStructure;
}
