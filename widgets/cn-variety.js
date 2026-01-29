WidgetMetadata = {
    id: "trakt_variety_core_fix",
    title: "Trakt 综艺核心 (修复版)",
    author: "Makkapakka",
    description: "修复数据加载问题。Trakt 驱动排期，TMDB 增强信息，支持降级显示。",
    version: "1.1.0",
    requiredVersion: "0.0.1",
    site: "https://trakt.tv",

    // 1. 全局参数：必须填写 Client ID
    globalParams: [
        {
            name: "traktClientId",
            title: "Trakt Client ID (必填)",
            type: "input",
            description: "请填入 Trakt Client ID",
            value: "" 
        }
    ],

    modules: [
        // ===========================================
        // 模块 1: 追新榜 (Calendar)
        // ===========================================
        {
            title: "📅 综艺追新榜",
            functionName: "loadTraktCalendar",
            type: "list",
            cacheDuration: 900, 
            params: [
                {
                    name: "region",
                    title: "地区筛选",
                    type: "enumeration",
                    value: "all",
                    enumOptions: [
                        { title: "🌏 全球聚合", value: "all" },
                        { title: "🇨🇳 国内综艺 (含港台)", value: "cn" },
                        { title: "🇺🇸 欧美/日韩", value: "global" }
                    ]
                },
                {
                    name: "days",
                    title: "时间范围",
                    type: "enumeration",
                    value: "7",
                    enumOptions: [
                        { title: "未来 7 天", value: "7" },
                        { title: "未来 14 天", value: "14" },
                        { title: "未来 30 天", value: "30" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        },

        // ===========================================
        // 模块 2: 热度榜 (Trending)
        // ===========================================
        {
            title: "🔥 综艺热度榜",
            functionName: "loadTraktTrending",
            type: "list",
            cacheDuration: 3600,
            params: [
                {
                    name: "region",
                    title: "地区筛选",
                    type: "enumeration",
                    value: "all",
                    enumOptions: [
                        { title: "🌏 全球聚合", value: "all" },
                        { title: "🇨🇳 国内综艺", value: "cn" },
                        { title: "🇺🇸 欧美/日韩", value: "global" }
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
    10764: "真人秀", 10767: "脱口秀", 10763: "新闻", 10766: "肥皂剧", 
    35: "喜剧", 10751: "家庭", 10762: "儿童", 18: "剧情"
};

function getGenreText(ids) {
    if (!ids || !Array.isArray(ids)) return "综艺";
    const genres = ids.map(id => GENRE_MAP[id]).filter(Boolean);
    return genres.length > 0 ? genres.slice(0, 2).join(" / ") : "综艺";
}

function buildItem({ id, tmdbId, type, title, year, poster, backdrop, rating, genreText, subTitle, desc }) {
    return {
        id: String(id),
        tmdbId: parseInt(tmdbId) || 0, // 允许为 0 (仅 Trakt 数据)
        type: tmdbId ? "tmdb" : "url", // 如果有 TMDB ID 则跳转详情，否则作为普通项
        mediaType: type || "tv",
        title: title,
        genreTitle: [year, genreText].filter(Boolean).join(" • "),
        subTitle: subTitle,
        posterPath: poster ? `https://image.tmdb.org/t/p/w500${poster}` : "",
        backdropPath: backdrop ? `https://image.tmdb.org/t/p/w780${backdrop}` : "",
        description: desc || "暂无简介",
        rating: rating ? Number(rating).toFixed(1) : "0.0",
        year: year
    };
}

function formatTraktDate(isoDateString) {
    if (!isoDateString) return "";
    const date = new Date(isoDateString);
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    const h = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    return `${m}-${d} ${h}:${min}`;
}

// =========================================================================
// 1. Trakt 追新榜 (修复版)
// =========================================================================

async function loadTraktCalendar(params = {}) {
    const { region = "all", days = "7", page = 1, traktClientId } = params;

    if (!traktClientId) {
        return [{ id: "err", type: "text", title: "错误：未填写 Client ID", subTitle: "请在 Widget 设置中填写" }];
    }

    const startDate = new Date().toISOString().split('T')[0];
    const baseUrl = `https://api.trakt.tv/calendars/all/shows/${startDate}/${days}`;
    
    // 构造参数 (移入 params 对象以确保编码正确)
    let apiParams = {
        genres: "reality,game-show,talk-show,news" // 确保没有空格
    };

    if (region === "cn") apiParams.countries = "cn,hk,tw";
    else if (region === "global") apiParams.countries = "us,kr,jp,gb";

    try {
        console.log(`Fetching Trakt Calendar: ${baseUrl}`);
        const res = await Widget.http.get(baseUrl, {
            params: apiParams,
            headers: {
                "Content-Type": "application/json",
                "trakt-api-version": "2",
                "trakt-api-key": traktClientId,
                "User-Agent": "ForwardWidget/1.0" // 增加 UA 防止被拦截
            }
        });

        const data = res.data || [];
        // 如果 data 是字符串 (有时 API 错误返回 HTML)，则通过 JSON.parse 尝试解析
        // Forward 通常会自动解析，但为了保险：
        const safeData = Array.isArray(data) ? data : [];

        if (safeData.length === 0) {
            return [{ id: "empty", type: "text", title: "暂无更新数据", subTitle: "Trakt 返回为空，请检查 ID 或网络" }];
        }

        // 本地分页
        const pageSize = 20;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        if (start >= safeData.length) return [];
        const pageItems = safeData.slice(start, end);

        const promises = pageItems.map(async (item) => {
            const show = item.show;
            const episode = item.episode;
            const tmdbId = show.ids.tmdb; // Trakt 提供的 TMDB ID
            
            // 基础信息 (Trakt 原生)
            let displayTitle = show.title;
            let displayOverview = episode.overview || show.overview;
            let displayPoster = "";
            let displayBackdrop = "";
            let displayRating = show.rating;
            let displayGenre = "综艺";
            
            // 尝试获取 TMDB 中文数据
            if (tmdbId) {
                const tmdbItem = await fetchTmdbDetail(tmdbId);
                if (tmdbItem) {
                    // 匹配成功：使用 TMDB 中文数据覆盖
                    displayTitle = tmdbItem.name || tmdbItem.title;
                    displayOverview = tmdbItem.overview || displayOverview;
                    displayPoster = tmdbItem.poster_path;
                    displayBackdrop = tmdbItem.backdrop_path;
                    displayRating = tmdbItem.vote_average;
                    displayGenre = getGenreText(tmdbItem.genres ? tmdbItem.genres.map(g => g.id) : []);
                }
            }

            // 构造副标题
            const timeStr = formatTraktDate(item.first_aired);
            const epStr = `S${episode.season}E${episode.number}`;

            return buildItem({
                id: tmdbId || `trakt_${show.ids.trakt}`, // 优先用 TMDB ID，没有则用 Trakt ID
                tmdbId: tmdbId,
                type: "tv",
                title: displayTitle,
                year: (show.year || "").toString(),
                poster: displayPoster,
                backdrop: displayBackdrop,
                rating: displayRating,
                genreText: displayGenre,
                subTitle: `${timeStr} • ${epStr}`,
                desc: `最新更新: ${episode.title || ("第" + episode.number + "集")}\n${displayOverview || "暂无简介"}`
            });
        });

        return await Promise.all(promises);

    } catch (e) {
        console.error(e);
        return [{ id: "err", type: "text", title: "请求异常", subTitle: String(e.message) }];
    }
}

// =========================================================================
// 2. Trakt 热度榜 (修复版)
// =========================================================================

async function loadTraktTrending(params = {}) {
    const { region = "all", page = 1, traktClientId } = params;

    if (!traktClientId) return [{ id: "err", type: "text", title: "请填写 Trakt Client ID" }];

    const limit = 20;
    const url = `https://api.trakt.tv/shows/trending`;
    
    let apiParams = {
        page: page,
        limit: limit,
        genres: "reality,game-show,talk-show"
    };
    
    if (region === "cn") apiParams.countries = "cn,hk,tw";
    else if (region === "global") apiParams.countries = "us,kr,jp,gb";

    try {
        const res = await Widget.http.get(url, {
            params: apiParams,
            headers: {
                "Content-Type": "application/json",
                "trakt-api-version": "2",
                "trakt-api-key": traktClientId,
                "User-Agent": "ForwardWidget/1.0"
            }
        });

        const data = res.data || [];
        
        const promises = data.map(async (item) => {
            const show = item.show;
            const tmdbId = show.ids.tmdb;

            let displayTitle = show.title;
            let displayPoster = "";
            let displayRating = 0;
            let displayGenre = "综艺";

            if (tmdbId) {
                const tmdbItem = await fetchTmdbDetail(tmdbId);
                if (tmdbItem) {
                    displayTitle = tmdbItem.name || tmdbItem.title;
                    displayPoster = tmdbItem.poster_path;
                    displayRating = tmdbItem.vote_average;
                    displayGenre = getGenreText(tmdbItem.genres ? tmdbItem.genres.map(g => g.id) : []);
                }
            }

            return buildItem({
                id: tmdbId || `trakt_${show.ids.trakt}`,
                tmdbId: tmdbId,
                type: "tv",
                title: displayTitle,
                year: (show.year || "").toString(),
                poster: displayPoster,
                backdrop: "",
                rating: displayRating,
                genreText: displayGenre,
                subTitle: `🔥 ${item.watchers} 人正在看`,
                desc: show.overview
            });
        });

        return await Promise.all(promises);

    } catch (e) { return [{ id: "err", type: "text", title: "热度榜加载失败" }]; }
}

// =========================================================================
// 3. 辅助函数
// =========================================================================

async function fetchTmdbDetail(tmdbId) {
    if (!tmdbId) return null;
    try {
        const res = await Widget.tmdb.get(`/tv/${tmdbId}`, {
            params: { language: "zh-CN" }
        });
        return res;
    } catch (e) {
        return null;
    }
}
