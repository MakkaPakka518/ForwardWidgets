WidgetMetadata = {
    id: "universal_m3u_player_pro",
    title: "万能直播源 (自定义版)",
    author: "Makkapakka",
    description: "专为虎牙/B站/Twitch等网络抓取源优化。支持自定义 User-Agent 以绕过限制。",
    version: "1.1.0",
    requiredVersion: "0.0.1",
    site: "https://github.com/2kuai/ForwardWidgets",

    modules: [
        {
            title: "直播源列表",
            functionName: "loadM3uList",
            type: "list",
            cacheDuration: 3600, 
            params: [
                {
                    name: "m3uUrl",
                    title: "直播源链接 (.m3u)",
                    type: "input",
                    description: "粘贴你的 M3U 链接",
                    value: "" // 1. 移除了内置源，保持纯净
                },
                {
                    name: "userAgent",
                    title: "User-Agent (伪装)",
                    type: "input",
                    description: "用于绕过源服务器限制",
                    // 2. 默认填入你提供的可用 UA
                    value: "AptvPlayer/1.4.17" 
                },
                {
                    name: "keyword",
                    title: "搜索/过滤",
                    type: "input",
                    description: "筛选频道名或分组"
                },
                {
                    name: "page",
                    title: "页码",
                    type: "page"
                }
            ]
        }
    ]
};

// =========================================================================
// 1. 核心逻辑
// =========================================================================

async function loadM3uList(params = {}) {
    const { m3uUrl, keyword, userAgent = "AptvPlayer/1.4.17", page = 1 } = params;

    if (!m3uUrl) {
        return [{ id: "tip", type: "text", title: "请先填写直播源链接" }];
    }

    try {
        // 3. 关键修复：在下载 M3U 文件时就带上伪装 UA
        // 之前这里是 Chrome UA，导致被服务器拒绝，所以你获取不到列表
        const res = await Widget.http.get(m3uUrl, {
            headers: { 
                "User-Agent": userAgent 
            }
        });

        const content = res.data || res || "";
        
        // 增加容错判断
        if (!content || typeof content !== "string") {
            // 有些源返回 JSON 或其他格式，这里做个简单检查
            return [{ id: "err", type: "text", title: "解析失败", subTitle: "源返回数据为空或非文本格式" }];
        }

        // 4. 解析 M3U
        let channels = parseM3uPlus(content);

        if (channels.length === 0) {
            // 尝试解析纯 URL 列表 (防止某些源没有 #EXTINF)
            if (content.includes("http")) {
                 channels = parseSimpleList(content);
            }
            
            if (channels.length === 0) {
                return [{ id: "empty", type: "text", title: "未解析到频道", subTitle: "请检查链接是否有效或受访问限制" }];
            }
        }

        // 5. 过滤 (搜索)
        if (keyword) {
            const lowerKw = keyword.toLowerCase();
            channels = channels.filter(ch => 
                (ch.name && ch.name.toLowerCase().includes(lowerKw)) || 
                (ch.group && ch.group.toLowerCase().includes(lowerKw))
            );
        }

        // 6. 分页处理
        const pageSize = 20;
        const total = channels.length;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        
        if (start >= total) return [];

        const pageItems = channels.slice(start, end);

        // 7. 构建 Forward Item
        return pageItems.map(ch => {
            let sub = "";
            if (ch.group) sub += `📂 ${ch.group}`;
            
            // 虎牙/B站抓取的源通常没有 logo，给个默认图标美化一下
            const defaultLogo = "https://img.icons8.com/color/144/000000/tv-show.png";
            
            return {
                id: ch.url, 
                type: "url", 
                videoUrl: ch.url, 
                
                title: ch.name || "未知直播间",
                subTitle: sub,
                posterPath: ch.logo || defaultLogo, 
                description: `分组: ${ch.group || "默认"}\n地址: ${ch.url}`,
                
                // 8. 关键修复：播放时也带上这个 UA
                customHeaders: {
                    "User-Agent": userAgent,
                    "Referer": m3uUrl // 部分源还需要 Referer
                }
            };
        });

    } catch (e) {
        return [{ id: "err", type: "text", title: "加载出错", subTitle: e.message }];
    }
}

// =========================================================================
// 2. M3U 解析器 (兼容性增强)
// =========================================================================

function parseM3uPlus(content) {
    const lines = content.split('\n');
    const channels = [];
    let currentChannel = null;

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (line.startsWith('#EXTINF:')) {
            currentChannel = {};
            
            // 提取 logo
            const logoMatch = line.match(/tvg-logo="([^"]*)"/);
            if (logoMatch) currentChannel.logo = logoMatch[1];

            // 提取分组
            const groupMatch = line.match(/group-title="([^"]*)"/);
            if (groupMatch) currentChannel.group = groupMatch[1];

            // 提取名称 (逗号后)
            const nameMatch = line.match(/,([^,]*)$/);
            if (nameMatch) {
                currentChannel.name = nameMatch[1].trim();
            } else {
                // 兜底：取最后一段
                const parts = line.split(',');
                if (parts.length > 1) currentChannel.name = parts[parts.length - 1].trim();
            }
        } 
        else if (!line.startsWith('#')) {
            // 是 URL 行
            if (currentChannel) {
                currentChannel.url = line;
                channels.push(currentChannel);
                currentChannel = null;
            } else {
                // 没有 EXTINF 头的裸 URL (容错)
                if (line.startsWith('http') || line.startsWith('rtmp') || line.startsWith('rtsp')) {
                     channels.push({
                         name: "直播频道",
                         url: line,
                         group: "未分类"
                     });
                }
            }
        }
    }
    return channels;
}

// 简单列表解析 (针对非标准 M3U)
function parseSimpleList(content) {
    const lines = content.split('\n');
    const channels = [];
    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('http') || line.startsWith('rtmp')) {
            channels.push({
                name: "直播频道",
                url: line,
                group: "自动识别"
            });
        }
    }
    return channels;
}
