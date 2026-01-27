WidgetMetadata = {
    id: "rottentomatoes_pro",
    title: "烂番茄口碑榜",
    author: "MakkaPakka",
    description: "抓取烂番茄新鲜认证(>75%)榜单，并自动匹配 TMDB 中文元数据。",
    version: "2.2.8",
    requiredVersion: "0.0.1",
    site: "https://www.rottentomatoes.com",
    
    // 1. 全局参数
    globalParams: [
        {
            name: "apiKey",
            title: "TMDB API Key (必填)",
            type: "input",
            description: "用于获取中文海报和详情。",
            value: ""
        }
    ],
    modules: [
        {
            title: "口碑避雷针",
            functionName: "loadRottenTomatoes",
            type: "list", // 推荐使用 list 类型以支持 genreTitle
            cacheDuration: 3600,
            params: [
                {
                    name: "listType",
                    title: "榜单类型",
                    type: "enumeration",
                    value: "movies_home",
                    enumOptions: [
                        { title: "流媒体热映 (Streaming)", value: "movies_home" },
                        { title: "院线热映 (Theaters)", value: "movies_theater" },
                        { title: "热门剧集 (TV Popular)", value: "tv_popular" },
                        { title: "最新剧集 (TV New)", value: "tv_new" },
                        { title: "最佳流媒体 (Best Streaming)", value: "movies_best" }
                    ]
                }
            ]
        }
    ]
};

// TMDB 类型映射表
const GENRE_MAP = {
    28: "动作", 12: "冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片",
    18: "剧情", 10751: "家庭", 14: "奇幻", 36: "历史", 27: "恐怖", 10402: "音乐",
    9648: "悬疑", 10749: "爱情", 878: "科幻", 10770: "电视电影", 53: "惊悚",
    10752: "战争", 37: "西部", 10759: "动作冒险", 10762: "儿童", 10763: "新闻",
    10764: "真人秀", 10765: "科幻奇幻", 10766: "肥皂剧", 10767: "脱口秀", 10768: "战争政治"
};

const TMDB_API = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p/w500";
const BACKDROP_BASE = "https://image.tmdb.org/t/p/w780";

const RT_URLS = {
    "movies_theater": "https://www.rottentomatoes.com/browse/movies_in_theaters/sort:popular?minTomato=75",
    "movies_home": "https://www.rottentomatoes.com/browse/movies_at_home/sort:popular?minTomato=75",
    "movies_best": "https://www.rottentomatoes.com/browse/movies_at_home/sort:critic_highest?minTomato=90",
    "tv_popular": "https://www.rottentomatoes.com/browse/tv_series_browse/sort:popular?minTomato=75",
    "tv_new": "https://www.rottentomatoes.com/browse/tv_series_browse/sort:newest?minTomato=75"
};

async function loadRottenTomatoes(params = {}) {
    const { apiKey, listType = "movies_home" } = params;

    if (!apiKey) {
        return [{ id: "err_no_key", type: "text", title: "配置缺失", subTitle: "请在设置中填入 TMDB API Key" }];
    }

    console.log(`[RT] Fetching: ${listType}`);
    const rtItems = await fetchRottenTomatoesList(listType);

    if (rtItems.length === 0) {
        return [{ id: "err_scrape", type: "text", title: "暂无数据", subTitle: "无法连接到烂番茄" }];
    }

    const matchPromises = rtItems.slice(0, 15).map((item, index) => 
        searchTmdb(item, apiKey, index + 1)
    );

    const results = await Promise.all(matchPromises);
    const finalItems = results.filter(Boolean);

    if (finalItems.length === 0) {
        return [{ id: "err_match", type: "text", title: "匹配失败", subTitle: "TMDB 搜索无结果" }];
    }

    return finalItems;
}

async function fetchRottenTomatoesList(type) {
    const url = RT_URLS[type] || RT_URLS["movies_home"];
    try {
        const res = await Widget.http.get(url, {
            headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)" }
        });
        const html = res.data || "";
        if (!html) return [];
        const $ = Widget.html.load(html);
        const items = [];
        
        $('[data-qa="discovery-media-list-item"]').each((i, el) => {
            const $el = $(el);
            const title = $el.find('[data-qa="discovery-media-list-item-title"]').text().trim();
            if (!title) return;
            const scoreEl = $el.find('score-pairs');
            items.push({
                title: title,
                tomatoScore: scoreEl.attr('critics-score') || "",
                popcornScore: scoreEl.attr('audiencescore') || "",
                mediaType: type.includes("tv") ? "tv" : "movie"
            });
        });
        return items;
    } catch (e) { return []; }
}

async function searchTmdb(rtItem, apiKey, rank) {
    const cleanTitle = rtItem.title.replace(/\s\(\d{4}\)$/, "");
    const url = `${TMDB_API}/search/${rtItem.mediaType}`;

    try {
        const res = await Widget.http.get(url, {
            params: { api_key: apiKey, query: cleanTitle, language: "zh-CN" }
        });
        const data = res.data;
        if (!data || !data.results || data.results.length === 0) return null;
        
        const match = data.results[0];
        
        // 1. 获取类型文本
        const genreText = (match.genre_ids || [])
            .map(id => GENRE_MAP[id])
            .filter(Boolean)
            .slice(0, 2)
            .join(" / ");
            
        // 2. 获取年份
        const year = (match.first_air_date || match.release_date || "").substring(0, 4);

        // 3. 构造副标题 (分数)
        let scoreTags = [];
        if (rtItem.tomatoScore) scoreTags.push(`🍅 ${rtItem.tomatoScore}%`);
        if (rtItem.popcornScore) scoreTags.push(`🍿 ${rtItem.popcornScore}%`);
        const subTitle = scoreTags.length > 0 ? scoreTags.join("  ") : "烂番茄认证";

        return {
            id: String(match.id),
            type: "tmdb",
            tmdbId: match.id,
            mediaType: rtItem.mediaType,
            
            title: `${rank}. ${match.name || match.title}`,
            
            // 【UI 核心】年份 • 类型
            genreTitle: [year, genreText].filter(Boolean).join(" • "),
            
            // 【UI 核心】烂番茄分数
            subTitle: subTitle,
            
            description: match.overview || `原名: ${rtItem.title}`,
            
            posterPath: match.poster_path ? `${IMG_BASE}${match.poster_path}` : "",
            backdropPath: match.backdrop_path ? `${BACKDROP_BASE}${match.backdrop_path}` : "",
            
            rating: match.vote_average ? match.vote_average.toFixed(1) : "0.0",
            year: year
        };
    } catch (e) { return null; }
}
