WidgetMetadata = {
    id: "anime_omni_fix",
    title: "二次元全境聚合",
    author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
    description: "一站式聚合多平台动漫榜单。",
    version: "2.2.4",
    requiredVersion: "0.0.1",
    site: "https://bgm.tv",

    modules: [
        {
            title: "Bilibili 热榜",
            functionName: "loadBilibiliRank",
            type: "video", // 建议使用 video 类型以获得更好元数据支持
            cacheDuration: 1800,
            params: [
                {
                    name: "type",
                    title: "榜单分区",
                    type: "enumeration",
                    value: "1",
                    enumOptions: [
                        { title: "📺 B站番剧 (日漫)", value: "1" },
                        { title: "🇨🇳 B站国创 (国漫)", value: "4" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        },
        {
            title: "Bangumi 追番日历",
            functionName: "loadBangumiCalendar",
            type: "video",
            cacheDuration: 3600,
            params: [
                {
                    name: "weekday",
                    title: "选择日期",
                    type: "enumeration",
                    value: "today",
                    enumOptions: [
                        { title: "📅 今日更新", value: "today" },
                        { title: "周一 (月)", value: "1" },
                        { title: "周二 (火)", value: "2" },
                        { title: "周三 (水)", value: "3" },
                        { title: "周四 (木)", value: "4" },
                        { title: "周五 (金)", value: "5" },
                        { title: "周六 (土)", value: "6" },
                        { title: "周日 (日)", value: "7" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        },
        {
            title: "TMDB 热门/新番",
            functionName: "loadTmdbAnimeRanking",
            type: "video",
            cacheDuration: 3600,
            params: [
                {
                    name: "sort",
                    title: "榜单类型",
                    type: "enumeration",
                    value: "trending",
                    enumOptions: [
                        { title: "🔥 实时流行 (Trending)", value: "trending" },
                        { title: "📅 最新首播 (New)", value: "new" },
                        { title: "👑 高分神作 (Top Rated)", value: "top" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        },
        {
            title: "AniList 流行榜",
            functionName: "loadAniListRanking",
            type: "video",
            cacheDuration: 7200,
            params: [
                {
                    name: "sort",
                    title: "排序方式",
                    type: "enumeration",
                    value: "TRENDING_DESC",
                    enumOptions: [
                        { title: "📈 近期趋势 (Trending)", value: "TRENDING_DESC" },
                        { title: "💖 历史人气 (Popularity)", value: "POPULARITY_DESC" },
                        { title: "⭐ 评分最高 (Score)", value: "SCORE_DESC" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        },
        {
            title: "MAL 权威榜单",
            functionName: "loadMalRanking",
            type: "video",
            cacheDuration: 7200,
            params: [
                {
                    name: "filter",
                    title: "榜单类型",
                    type: "enumeration",
                    value: "airing",
                    enumOptions: [
                        { title: "🔥 当前热播 Top", value: "airing" },
                        { title: "🏆 历史总榜 Top", value: "all" },
                        { title: "🎥 最佳剧场版", value: "movie" },
                        { title: "🔜 即将上映", value: "upcoming" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        }
    ]
};

// =========================================================================
// 0. 核心工具
// =========================================================================

const GENRE_MAP = {
    16: "动画", 10759: "动作冒险", 35: "喜剧", 18: "剧情", 14: "奇幻", 
    878: "科幻", 9648: "悬疑", 10749: "爱情", 27: "恐怖", 10765: "科幻奇幻"
};

function getGenreText(ids) {
    if (!ids || !Array.isArray(ids)) return "动画";
    const genres = ids.filter(id => id !== 16).map(id => GENRE_MAP[id]).filter(Boolean);
    return genres.length > 0 ? genres.slice(0, 2).join(" / ") : "动画";
}

function getWeekdayName(id) {
    const map = { 1: "周一", 2: "周二", 3: "周三", 4: "周四", 5: "周五", 6: "周六", 7: "周日", 0: "周日" };
    return map[id] || "";
}

/**
 * 核心修正：优化副标题逻辑
 */
function buildItem({ id, tmdbId, type, title, date, poster, backdrop, rating, genreText, subTitle, desc }) {
    return {
        id: String(id),
        tmdbId: parseInt(tmdbId),
        type: "tmdb", 
        mediaType: type || "tv",
        title: title,
        
        // --- 修正1：只留类型标签，去掉年份，防止横版双年份 ---
        genreTitle: genreText || "动画", 
        
        // --- 修正2：副标题显示具体日期 (YYYY-MM-DD)，适配竖版 ---
        description: date || subTitle || "暂无日期", 
        
        // --- 修正3：传给内核的日期字段，内核会自动提取年份给横版 UI ---
        releaseDate: date,
        
        posterPath: poster ? `https://image.tmdb.org/t/p/w500${poster}` : "",
        backdropPath: backdrop ? `https://image.tmdb.org/t/p/w780${backdrop}` : "",
        rating: rating ? Number(rating).toFixed(1) : "0.0"
    };
}

// =========================================================================
// 1. 各模块函数逻辑 (已适配 buildItem 参数)
// =========================================================================

async function loadBilibiliRank(params = {}) {
    const { type = "1", page = 1 } = params;
    const url = `https://api.bilibili.com/pgc/web/rank/list?day=3&season_type=${type}`;
    try {
        const res = await Widget.http.get(url, {
            headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://www.bilibili.com/" }
        });
        const data = res.data || {};
        const fullList = data.result?.list || data.data?.list || [];
        const pageSize = 20;
        const slicedList = fullList.slice((page - 1) * pageSize, page * pageSize);

        const promises = slicedList.map(async (item, index) => {
            const cleanTitle = item.title.replace(/第[一二三四五六七八九十\d]+[季章]/g, "").trim();
            const tmdbItem = await searchTmdbBestMatch(cleanTitle, item.title);
            if (!tmdbItem) return null;

            return buildItem({
                id: tmdbItem.id,
                tmdbId: tmdbItem.id,
                type: "tv",
                title: tmdbItem.name || tmdbItem.title,
                date: tmdbItem.first_air_date, // 传具体日期
                poster: tmdbItem.poster_path,
                backdrop: tmdbItem.backdrop_path,
                rating: tmdbItem.vote_average,
                genreText: getGenreText(tmdbItem.genre_ids),
                subTitle: `No.${(page - 1) * pageSize + index + 1}`,
                desc: tmdbItem.overview
            });
        });
        const results = await Promise.all(promises);
        return results.filter(Boolean);
    } catch (e) { return []; }
}

async function loadBangumiCalendar(params = {}) {
    const { weekday = "today", page = 1 } = params;
    let targetDayId = parseInt(weekday);
    if (weekday === "today") {
        const jsDay = new Date().getDay();
        targetDayId = jsDay === 0 ? 7 : jsDay;
    }
    try {
        const res = await Widget.http.get("https://api.bgm.tv/calendar");
        const dayData = (res.data || []).find(d => d.weekday && d.weekday.id === targetDayId);
        if (!dayData) return [];
        const pageSize = 20;
        const pageItems = dayData.items.slice((page - 1) * pageSize, page * pageSize);

        const promises = pageItems.map(async (item) => {
            const tmdbItem = await searchTmdbBestMatch(item.name_cn || item.name, item.name);
            if (!tmdbItem) return null;

            return buildItem({
                id: tmdbItem.id,
                tmdbId: tmdbItem.id,
                type: "tv",
                title: tmdbItem.name || tmdbItem.title,
                date: tmdbItem.first_air_date || item.air_date,
                poster: tmdbItem.poster_path,
                backdrop: tmdbItem.backdrop_path,
                rating: item.rating?.score || tmdbItem.vote_average,
                genreText: getGenreText(tmdbItem.genre_ids),
                desc: tmdbItem.overview
            });
        });
        const results = await Promise.all(promises);
        return results.filter(Boolean);
    } catch (e) { return []; }
}

async function loadTmdbAnimeRanking(params = {}) {
    const { sort = "trending", page = 1 } = params;
    let queryParams = { language: "zh-CN", page: page, with_genres: "16", with_original_language: "ja" };
    if (sort === "trending") queryParams.sort_by = "popularity.desc";
    else if (sort === "new") queryParams.sort_by = "first_air_date.desc";
    else if (sort === "top") queryParams.sort_by = "vote_average.desc";

    try {
        const res = await Widget.tmdb.get("/discover/tv", { params: queryParams });
        return (res.results || []).map(item => buildItem({
            id: item.id,
            tmdbId: item.id,
            type: "tv",
            title: item.name,
            date: item.first_air_date,
            poster: item.poster_path,
            backdrop: item.backdrop_path,
            rating: item.vote_average,
            genreText: getGenreText(item.genre_ids),
            desc: item.overview
        }));
    } catch (e) { return []; }
}

async function loadAniListRanking(params = {}) {
    const { sort = "TRENDING_DESC", page = 1 } = params;
    const query = `query ($page: Int, $perPage: Int) { Page (page: $page, perPage: $perPage) { media (sort: ${sort}, type: ANIME) { title { native romaji english } averageScore seasonYear } } }`;
    try {
        const res = await Widget.http.post("https://graphql.anilist.co", { query, variables: { page, perPage: 20 } });
        const data = res.data?.data?.Page?.media || [];
        const promises = data.map(async (media) => {
            const tmdbItem = await searchTmdbBestMatch(media.title.native || media.title.romaji, media.title.english);
            if (!tmdbItem) return null;
            return buildItem({
                id: tmdbItem.id,
                tmdbId: tmdbItem.id,
                type: "tv",
                title: tmdbItem.name || tmdbItem.title,
                date: tmdbItem.first_air_date,
                poster: tmdbItem.poster_path,
                backdrop: tmdbItem.backdrop_path,
                rating: (media.averageScore / 10),
                genreText: getGenreText(tmdbItem.genre_ids),
                desc: tmdbItem.overview
            });
        });
        const results = await Promise.all(promises);
        return results.filter(Boolean);
    } catch (e) { return []; }
}

async function loadMalRanking(params = {}) {
    const { filter = "airing", page = 1 } = params;
    let apiParams = { page: page };
    if (filter === "airing") apiParams.filter = "airing";
    else if (filter === "upcoming") apiParams.filter = "upcoming";

    try {
        const res = await Widget.http.get("https://api.jikan.moe/v4/top/anime", { params: apiParams });
        const data = res.data?.data || [];
        const promises = data.map(async (item) => {
            const tmdbItem = await searchTmdbBestMatch(item.title_japanese || item.title, item.title_english);
            if (!tmdbItem) return null;
            return buildItem({
                id: tmdbItem.id,
                tmdbId: tmdbId,
                type: "tv",
                title: tmdbItem.name,
                date: tmdbItem.first_air_date,
                poster: tmdbItem.poster_path,
                backdrop: tmdbItem.backdrop_path,
                rating: item.score,
                genreText: getGenreText(tmdbItem.genre_ids),
                desc: tmdbItem.overview
            });
        });
        const results = await Promise.all(promises);
        return results.filter(Boolean);
    } catch (e) { return []; }
}

// =========================================================================
// 2. TMDB 智能匹配
// =========================================================================

async function searchTmdbBestMatch(query1, query2) {
    let res = await searchTmdb(query1);
    if (!res && query2) res = await searchTmdb(query2);
    return res;
}

async function searchTmdb(query) {
    if (!query) return null;
    const cleanQuery = query.replace(/第[一二三四五六七八九十\d]+[季章]/g, "").replace(/Season \d+/i, "").trim();
    try {
        const res = await Widget.tmdb.get("/search/multi", { params: { query: cleanQuery, language: "zh-CN", page: 1 } });
        const candidates = (res.results || []).filter(r => r.media_type === "tv" || r.media_type === "movie");
        return candidates.find(r => r.poster_path) || candidates[0];
    } catch (e) { return null; }
}
