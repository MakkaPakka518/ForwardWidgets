WidgetMetadata = {
    id: "flixpatrol_pro",
    title: "国外流媒体 TOP10",
    author: "MakkaPakka",
    description: "抓取 Netflix/HBO 等平台官方榜单，智能匹配 TMDB 中文数据。",
    version: "3.0.0",
    requiredVersion: "0.0.1",
    site: "https://flixpatrol.com",

    // 1. 全局参数
    globalParams: [
        {
            name: "apiKey",
            title: "TMDB API Key (必填)",
            type: "input",
            description: "用于获取海报和匹配中文数据。",
            value: ""
        }
    ],

    modules: [
        {
            title: "官方 Top 10",
            functionName: "loadOfficialTop10",
            type: "video", // 使用标准 video 类型
            cacheDuration: 3600, // 缓存1小时
            params: [
                {
                    name: "platform",
                    title: "流媒体平台",
                    type: "enumeration",
                    value: "netflix",
                    enumOptions: [
                        { title: "Netflix (网飞)", value: "netflix" },
                        { title: "HBO (Max)", value: "hbo" },
                        { title: "Disney+ (迪士尼)", value: "disney" },
                        { title: "Apple TV+", value: "apple-tv" },
                        { title: "Amazon Prime", value: "amazon-prime" }
                    ]
                },
                {
                    name: "region",
                    title: "榜单地区",
                    type: "enumeration",
                    value: "united-states",
                    enumOptions: [
                        { title: "美国 (United States)", value: "united-states" },
                        { title: "韩国 (South Korea)", value: "south-korea" },
                        { title: "台湾 (Taiwan)", value: "taiwan" },
                        { title: "香港 (Hong Kong)", value: "hong-kong" },
                        { title: "日本 (Japan)", value: "japan" },
                        { title: "英国 (United Kingdom)", value: "united-kingdom" }
                    ]
                },
                {
                    name: "mediaType",
                    title: "榜单类型",
                    type: "enumeration",
                    value: "tv",
                    enumOptions: [
                        { title: "电视剧 (TV Shows)", value: "tv" },
                        { title: "电影 (Movies)", value: "movie" }
                    ]
                }
            ]
        }
    ]
};

async function loadOfficialTop10(params = {}) {
    // 1. 获取参数
    const { apiKey, platform = "netflix", region = "united-states", mediaType = "tv" } = params;

    if (!apiKey) {
        return [{
            id: "error_no_key",
            type: "text",
            title: "配置缺失",
            subTitle: "请在设置中填入 TMDB API Key"
        }];
    }

    console.log(`[FlixPatrol] Fetching: ${platform} / ${region}`);

    // 2. 抓取 FlixPatrol (真实榜单)
    let titles = await fetchFlixPatrolData(platform, region, mediaType);

    // 3. 兜底逻辑：如果抓取失败，启用 TMDB 兜底
    if (titles.length === 0) {
        console.log("[FlixPatrol] Failed, fallback to TMDB...");
        return await fetchTmdbFallback(platform, region, mediaType, apiKey);
    }

    console.log(`[FlixPatrol] Got ${titles.length} titles. Matching TMDB...`);

    // 4. 将标题转换为 TMDB ID
    // 限制并发数为 10，防止被 TMDB 限流
    const searchPromises = titles.slice(0, 10).map((title, index) => 
        searchTmdb(title, mediaType, apiKey, index + 1)
    );

    const results = await Promise.all(searchPromises);
    const finalItems = results.filter(Boolean);

    if (finalItems.length === 0) {
        return [{
            id: "error_match_fail",
            type: "text",
            title: "数据匹配失败",
            subTitle: "获取到了榜单标题，但 TMDB 搜索无结果"
        }];
    }

    return finalItems;
}

// ==========================================
// 核心：FlixPatrol 网页解析
// ==========================================

async function fetchFlixPatrolData(platform, region, mediaType) {
    // FlixPatrol 的 URL 结构
    const url = `https://flixpatrol.com/top10/${platform}/${region}/`;
    
    try {
        const res = await Widget.http.get(url, {
            headers: { 
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://flixpatrol.com/"
            }
        });

        const html = res.data || "";
        if (!html) return [];

        const $ = Widget.html.load(html);
        
        // FlixPatrol 页面结构通常包含多个榜单 (Movies, TV)
        // 我们通过查找包含特定关键词的表头来定位正确的表格
        let targetTable = null;
        
        // 尝试定位 Movies 或 TV 表格
        const sectionKeyword = mediaType === "movie" ? "Movies" : "TV";
        
        // 遍历所有表格容器
        $('div.card').each((i, el) => {
            const $card = $(el);
            const headerText = $card.find('h2').text();
            
            // 如果卡片标题包含 "Movies" 且我们找 movie，或者包含 "TV" 且我们找 tv
            // 且该表格包含 "Top 10" 字样 (防止抓到其他统计表)
            if (headerText.includes(sectionKeyword)) {
                targetTable = $card.find('table tbody');
                return false; // break loop
            }
        });

        // 如果没找到特定标题的，尝试按默认顺序 (通常第一个是 Movie，第二个是 TV)
        if (!targetTable) {
            const tables = $('table tbody');
            if (tables.length >= 2) {
                targetTable = mediaType === "movie" ? tables.eq(0) : tables.eq(1);
            } else if (tables.length === 1) {
                targetTable = tables.eq(0);
            } else {
                return [];
            }
        }

        const titles = [];
        targetTable.find('tr').each((i, el) => {
            if (i >= 10) return; // 只取前10

            // 提取标题逻辑：优先取链接文本，其次取纯文本
            const $link = $(el).find('a.hover\\:underline');
            let title = $link.text().trim();
            
            // 如果没链接，尝试找表格行的文本
            if (!title) {
                // 通常标题在第3列 (排名, 图片, 标题)
                title = $(el).find('td').eq(2).text().trim();
            }

            if (title && title.length > 1) {
                // 去除年份后缀 e.g., "Title (2023)" -> "Title"
                title = title.replace(/\s\(\d{4}\)$/, '').trim();
                titles.push(title);
            }
        });

        return titles;

    } catch (e) {
        console.error("FlixPatrol Error:", e);
        return [];
    }
}

// ==========================================
// TMDB 匹配工具
// ==========================================

async function searchTmdb(queryTitle, mediaType, apiKey, rank) {
    const cleanTitle = queryTitle.trim();
    // 搜索时加上 year 可能会提高准确率，但 FlixPatrol 有时不给 year，所以只搜标题
    const url = `https://api.themoviedb.org/3/search/${mediaType}?api_key=${apiKey}&query=${encodeURIComponent(cleanTitle)}&language=zh-CN`;

    try {
        const res = await Widget.http.get(url);
        const data = res.data;
        
        if (data && data.results && data.results.length > 0) {
            // 取第一个匹配项
            const match = data.results[0];
            
            // 构造返回项
            return {
                id: String(match.id),
                type: "tmdb",
                tmdbId: match.id,
                mediaType: mediaType,
                
                // 标题带排名
                title: `${rank}. ${match.name || match.title}`,
                
                // 副标题显示原名
                subTitle: match.original_name || match.original_title,
                
                posterPath: match.poster_path ? `https://image.tmdb.org/t/p/w500${match.poster_path}` : "",
                backdropPath: match.backdrop_path ? `https://image.tmdb.org/t/p/w780${match.backdrop_path}` : "",
                
                rating: match.vote_average ? match.vote_average.toFixed(1) : "0.0",
                year: (match.first_air_date || match.release_date || "").substring(0, 4),
                
                description: `官方榜单 #${rank}`
            };
        }
    } catch (e) {}
    return null;
}

// ==========================================
// 兜底逻辑：直接用 TMDB 发现接口
// ==========================================

async function fetchTmdbFallback(platform, region, mediaType, apiKey) {
    const providerMap = { "netflix": "8", "disney": "337", "hbo": "1899|118", "apple-tv": "350", "amazon-prime": "119" };
    const regionMap = { "united-states": "US", "south-korea": "KR", "taiwan": "TW", "hong-kong": "HK", "japan": "JP", "united-kingdom": "GB" };
    
    const pid = providerMap[platform] || "8";
    const reg = regionMap[region] || "US";
    
    // 使用 TMDB Discover 接口模拟榜单
    const url = `https://api.themoviedb.org/3/discover/${mediaType}?api_key=${apiKey}&watch_region=${reg}&with_watch_providers=${pid}&sort_by=popularity.desc&page=1&language=zh-CN`;

    try {
        const res = await Widget.http.get(url);
        const data = res.data || {};
        
        return (data.results || []).slice(0, 10).map((item, index) => ({
            id: String(item.id),
            type: "tmdb",
            tmdbId: item.id,
            mediaType: mediaType,
            
            title: `${index + 1}. ${item.title || item.name}`,
            subTitle: item.original_name || item.original_title,
            
            posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
            backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
            
            rating: item.vote_average ? item.vote_average.toFixed(1) : "0.0",
            year: (item.first_air_date || item.release_date || "").substring(0, 4),
            description: `平台热度 #${index + 1}`
        }));
    } catch (e) { return []; }
}
