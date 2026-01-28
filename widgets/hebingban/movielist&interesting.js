WidgetMetadata = {
    id: "cinephile_hub_ultimate",
    title: "影迷宝藏 | 系列与流派",
    author: "MakkaPakka",
    description: "聚合【系列电影大满贯】与【趣味流派设定】。一键补番，探索未知。",
    version: "1.0.3",
    requiredVersion: "0.0.1",
    site: "https://www.themoviedb.org",

    // 0. 全局免 Key
    globalParams: [],

    modules: [
        // ===========================================
        // 模块 1: 系列电影大满贯 (IP合集)
        // ===========================================
        {
            title: "系列电影大满贯",
            functionName: "loadFranchise",
            type: "list",
            cacheDuration: 3600,
            params: [
                {
                    name: "presetId",
                    title: "选择系列",
                    type: "enumeration",
                    value: "custom",
                    enumOptions: [
                        { title: "🔍 自定义搜索 (手动输入)", value: "custom" },
                        { title: "⚡ 哈利波特 (Harry Potter)", value: "1241" },
                        { title: "🦸 漫威宇宙 (MCU)", value: "86311" },
                        { title: "🕵️ 007 詹姆斯邦德", value: "645" },
                        { title: "💍 指环王 (Lord of the Rings)", value: "119" },
                        { title: "🌌 星球大战 (Star Wars)", value: "10" },
                        { title: "🏎️ 速度与激情", value: "9485" },
                        { title: "💣 碟中谍 (Mission: Impossible)", value: "87359" },
                        { title: "🦇 蝙蝠侠 (Nolan)", value: "263" },
                        { title: "🤖 变形金刚", value: "8650" },
                        { title: "🕶️ 黑客帝国", value: "2344" },
                        { title: "🏴‍☠️ 加勒比海盗", value: "295" },
                        { title: "🧟 生化危机 (Resident Evil)", value: "8925" },
                        { title: "👽 异形 (Alien)", value: "8091" },
                        { title: "🔫 教父 (The Godfather)", value: "230" },
                        { title: "🤠 玩具总动员", value: "10194" },
                        { title: "🏹 饥饿游戏", value: "131635" },
                        { title: "🧛 暮光之城", value: "33514" }
                    ]
                },
                {
                    name: "customQuery",
                    title: "搜索系列名",
                    type: "input",
                    description: "例如：教父、功夫熊猫、John Wick",
                    belongTo: { paramName: "presetId", value: ["custom"] }
                },
                {
                    name: "sortOrder",
                    title: "观看顺序",
                    type: "enumeration",
                    value: "asc",
                    enumOptions: [
                        { title: "上映时间 (正序 1->N)", value: "asc" },
                        { title: "上映时间 (倒序 N->1)", value: "desc" },
                        { title: "评分 (高->低)", value: "rating" }
                    ]
                }
            ]
        },

        // ===========================================
        // 模块 2: 设定控 (特殊流派)
        // ===========================================
        {
            title: "趣味流派设定",
            functionName: "loadNicheGenre",
            type: "list",
            cacheDuration: 3600,
            params: [
                {
                    name: "themeId",
                    title: "选择感兴趣的设定",
                    type: "enumeration",
                    value: "12190",
                    enumOptions: [
                        { title: "🤖 赛博朋克 (Cyberpunk)", value: "12190" },
                        { title: "⏳ 时空循环 (Time Loop)", value: "4366|193382" },
                        { title: "🧟 丧尸围城 (Zombie)", value: "12377" },
                        { title: "🚀 太空歌剧 (Space Opera)", value: "3737" },
                        { title: "🔪 大逃杀/吃鸡 (Battle Royale)", value: "10565|263628" },
                        { title: "🐙 克苏鲁/洛夫克拉夫特", value: "210368" },
                        { title: "⚙️ 蒸汽朋克 (Steampunk)", value: "11105" },
                        { title: "🏚️ 末日废土 (Post-apocalyptic)", value: "2853" },
                        { title: "🕵️ 密室/本格推理 (Whodunit)", value: "10714" },
                        { title: "👻 伪纪录片 (Found Footage)", value: "10620" },
                        { title: "🦈 巨物恐惧 (Monster)", value: "4064" },
                        { title: "🧠 烧脑/心理惊悚", value: "9919" },
                        { title: "🦄 黑暗奇幻 (Dark Fantasy)", value: "3205" }
                    ]
                },
                {
                    name: "mediaType",
                    title: "类型",
                    type: "enumeration",
                    value: "movie",
                    enumOptions: [ { title: "电影", value: "movie" }, { title: "剧集", value: "tv" } ]
                },
                {
                    name: "sort",
                    title: "排序",
                    type: "enumeration",
                    value: "popularity.desc",
                    enumOptions: [
                        { title: "最热门", value: "popularity.desc" },
                        { title: "评分最高", value: "vote_average.desc" },
                        { title: "最新上映", value: "primary_release_date.desc" }
                    ]
                }
            ]
        }
    ]
};

// =========================================================================
// 0. 通用工具与字典
// =========================================================================

const GENRE_MAP = {
    28: "动作", 12: "冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片",
    18: "剧情", 10751: "家庭", 14: "奇幻", 36: "历史", 27: "恐怖", 10402: "音乐",
    9648: "悬疑", 10749: "爱情", 878: "科幻", 10770: "电视电影", 53: "惊悚",
    10752: "战争", 37: "西部", 10759: "动作冒险", 10762: "儿童", 10763: "新闻",
    10764: "真人秀", 10765: "科幻奇幻", 10766: "肥皂剧", 10767: "脱口秀", 10768: "战争政治"
};

function getGenreText(ids) {
    if (!ids || !Array.isArray(ids)) return "";
    return ids.map(id => GENRE_MAP[id]).filter(Boolean).slice(0, 3).join(" / ");
}

function buildItem({ id, tmdbId, type, title, year, poster, backdrop, rating, genreText, subTitle, desc }) {
    return {
        id: String(id),
        tmdbId: parseInt(tmdbId),
        type: "tmdb",
        mediaType: type,
        title: title,
        genreTitle: [year, genreText].filter(Boolean).join(" • "), 
        subTitle: subTitle,
        posterPath: poster ? `https://image.tmdb.org/t/p/w500${poster}` : "",
        backdropPath: backdrop ? `https://image.tmdb.org/t/p/w780${backdrop}` : "",
        description: desc || "暂无简介",
        rating: rating,
        year: year
    };
}

// =========================================================================
// 1. 业务逻辑：系列电影大满贯
// =========================================================================

async function loadFranchise(params = {}) {
    const { presetId = "custom", customQuery, sortOrder = "asc" } = params;
    
    let collectionId = presetId;
    let collectionName = "";

    // 1. 自定义搜索
    if (presetId === "custom") {
        if (!customQuery) return [{ id: "err_no_q", type: "text", title: "请输入搜索词" }];
        
        console.log(`[Collection] Searching: ${customQuery}`);
        const searchResult = await searchCollection(customQuery);
        
        if (!searchResult) return [{ id: "err_404", type: "text", title: "未找到合集", subTitle: `TMDB 中没有 "${customQuery}" 的官方系列合集` }];
        
        collectionId = searchResult.id;
        collectionName = searchResult.name;
    }

    console.log(`[Collection] Fetching ID: ${collectionId}`);

    // 2. 获取合集 (免 Key)
    try {
        const res = await Widget.tmdb.get(`/collection/${collectionId}`, { params: { language: "zh-CN" } });
        const data = res || {};

        if (!data.parts || data.parts.length === 0) return [{ id: "err_empty", type: "text", title: "合集数据为空" }];

        // 3. 排序
        let movies = data.parts;
        movies.sort((a, b) => {
            if (sortOrder === "rating") return b.vote_average - a.vote_average;
            const dateA = a.release_date ? new Date(a.release_date) : new Date("2099-01-01");
            const dateB = b.release_date ? new Date(b.release_date) : new Date("2099-01-01");
            return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
        });

        // 4. 格式化
        const finalName = data.name || collectionName || "系列合集";
        
        return movies.map((item, index) => {
            const year = (item.release_date || "").substring(0, 4);
            const rank = index + 1;
            const genreText = getGenreText(item.genre_ids);
            
            return buildItem({
                id: item.id, tmdbId: item.id, type: "movie",
                title: `${rank}. ${item.title}`,
                year: year,
                poster: item.poster_path,
                backdrop: item.backdrop_path,
                rating: item.vote_average?.toFixed(1) || "0.0",
                genreText: genreText,
                subTitle: `TMDB ${item.vote_average?.toFixed(1) || 0.0}`,
                desc: `所属: ${finalName}\n${item.overview || ""}`
            });
        });

    } catch (e) {
        return [{ id: "err_net", type: "text", title: "请求失败", subTitle: e.message }];
    }
}

// =========================================================================
// 2. 业务逻辑：设定控 (趣味流派)
// =========================================================================

async function loadNicheGenre(params = {}) {
    const { themeId, mediaType = "movie", sort = "popularity.desc" } = params;

    const queryParams = {
        language: "zh-CN",
        sort_by: sort,
        include_adult: false,
        include_video: false,
        page: 1,
        with_keywords: themeId,
        "vote_count.gte": 50
    };

    if (sort === "vote_average.desc") queryParams["vote_count.gte"] = 300;
    // 修正排序字段
    if (mediaType === "tv" && sort.includes("primary_release_date")) queryParams.sort_by = "first_air_date.desc";

    try {
        const res = await Widget.tmdb.get(`/discover/${mediaType}`, { params: queryParams });
        const data = res || {};
        
        if (!data.results || data.results.length === 0) return [{ id: "empty", type: "text", title: "暂无数据" }];

        return data.results.map(item => {
            const year = (item.first_air_date || item.release_date || "").substring(0, 4);
            const genreText = getGenreText(item.genre_ids);
            
            return buildItem({
                id: item.id, tmdbId: item.id, type: mediaType,
                title: item.name || item.title,
                year: year,
                poster: item.poster_path,
                backdrop: item.backdrop_path,
                rating: item.vote_average?.toFixed(1) || "0.0",
                genreText: genreText,
                subTitle: `TMDB ${item.vote_average?.toFixed(1) || "0.0"}`,
                desc: item.overview || `原名: ${item.original_name || item.original_title}`
            });
        });

    } catch (e) {
        return [{ id: "err_net", type: "text", title: "网络错误", subTitle: e.message }];
    }
}

// =========================================================================
// 3. 辅助函数
// =========================================================================

async function searchCollection(query) {
    try {
        const res = await Widget.tmdb.get("/search/collection", {
            params: { query: encodeURIComponent(query), language: "zh-CN", page: 1 }
        });
        const data = res || {};
        if (data.results && data.results.length > 0) return data.results[0];
    } catch (e) {}
    return null;
}
