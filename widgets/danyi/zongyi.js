WidgetMetadata = {
    id: "variety_hub_ultimate_v3_ui",
    title: "全球综艺榜",
    author: "Makkapakka",
    description: "综艺更新时刻表｜综艺热榜",
    version: "3.0.1",
    requiredVersion: "0.0.1",
    site: "https://www.themoviedb.org",

    modules: [
        {
            title: "综艺聚合",
            functionName: "loadVarietyUltimate",
            type: "list",
            cacheDuration: 300, 
            params: [
                {
                    name: "listType",
                    title: "榜单类型",
                    type: "enumeration",
                    value: "calendar",
                    enumOptions: [
                        { title: "📅 追新榜 (按更新时间)", value: "calendar" },
                        { title: "🔥 热度榜 (按流行度)", value: "hot" }
                    ]
                },
                {
                    name: "days",
                    title: "追更范围",
                    type: "enumeration",
                    value: "14",
                    belongTo: { paramName: "listType", value: ["calendar"] },
                    enumOptions: [
                        { title: "最近 7 天", value: "7" },
                        { title: "最近 14 天", value: "14" },
                        { title: "最近 30 天", value: "30" }
                    ]
                },
                {
                    name: "region",
                    title: "地区筛选",
                    type: "enumeration",
                    value: "all",
                    enumOptions: [
                        { title: "🌏 全部地区", value: "all" },
                        { title: "🇨🇳 国内综艺", value: "cn" },
                        { title: "✈️ 国外综艺", value: "global" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        }
    ]
};

// =========================================================================
// 0. 工具函数
// =========================================================================

const GENRE_MAP = {
    10764: "真人秀", 10767: "脱口秀", 10763: "新闻", 
    35: "喜剧", 10751: "家庭", 18: "剧情"
};

function getGenreText(ids) {
    if (!ids || !Array.isArray(ids)) return "综艺";
    const target = ids.find(id => id === 10764 || id === 10767) || ids[0];
    return GENRE_MAP[target] || "综艺";
}

// 格式化日期 MM-30
function formatShortDate(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${m}-${d}`;
}

// 计算日期
function getPastDateStr(days) {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(days));
    return d.toISOString().split('T')[0];
}

function getFutureDateStr(days) {
    const d = new Date();
    d.setDate(d.getDate() + parseInt(days));
    return d.toISOString().split('T')[0];
}

// =========================================================================
// 1. 核心逻辑
// =========================================================================

async function loadVarietyUltimate(params = {}) {
    const { listType = "calendar", region = "all", days = "14", page = 1 } = params;

    let discoverUrl = `/discover/tv`;
    let queryParams = {
        language: "zh-CN",
        page: page,
        with_genres: "10764|10767", 
        sort_by: "popularity.desc",
        "vote_count.gte": 0,
        include_null_first_air_dates: false
    };

    if (region === "cn") {
        queryParams.with_origin_country = "CN";
    } else if (region === "global") {
        queryParams.with_origin_country = "US|KR|JP|GB|TW|HK|TH";
    }

    if (listType === "calendar") {
        const startDate = getPastDateStr(days);
        const endDate = getFutureDateStr(7);
        queryParams["air_date.gte"] = startDate;
        queryParams["air_date.lte"] = endDate;
    }

    try {
        const res = await Widget.tmdb.get(discoverUrl, { params: queryParams });
        const rawResults = res.results || [];

        if (rawResults.length === 0) return [];

        const detailPromises = rawResults.map(async (item) => {
            if (!item.poster_path) return null;

            try {
                const detail = await Widget.tmdb.get(`/tv/${item.id}`, { 
                    params: { language: "zh-CN" } 
                });
                
                const nextEp = detail.next_episode_to_air;
                const lastEp = detail.last_episode_to_air;
                
                let sortDate = "1970-01-01";
                let displayDateLabel = "";
                let displayEpLabel = "";

                if (nextEp) {
                    sortDate = nextEp.air_date;
                    displayDateLabel = formatShortDate(sortDate);
                    displayEpLabel = `S${nextEp.season_number}E${nextEp.episode_number}`;
                } else if (lastEp) {
                    sortDate = lastEp.air_date;
                    displayDateLabel = formatShortDate(sortDate);
                    displayEpLabel = `S${lastEp.season_number}E${lastEp.episode_number}`;
                } else {
                    if (listType === "calendar") return null;
                    sortDate = item.first_air_date;
                }

                return {
                    detail: detail,
                    sortDate: sortDate,
                    displayDateLabel: displayDateLabel,
                    displayEpLabel: displayEpLabel
                };
            } catch (e) {
                return null;
            }
        });

        const detailedItems = (await Promise.all(detailPromises)).filter(Boolean);

        if (listType === "calendar") {
            detailedItems.sort((a, b) => {
                if (a.sortDate === b.sortDate) return 0;
                return a.sortDate < b.sortDate ? 1 : -1; 
            });
        }

        return detailedItems.map(data => {
            const { detail, displayDateLabel, displayEpLabel, sortDate } = data;
            
            const genre = getGenreText(detail.genres ? detail.genres.map(g => g.id) : []);
            
            let subTitleStr = "";
            let genreTitleStr = "";

            if (listType === "calendar") {
                // === 💡 核心修改区域 ===
                
                // 1. 右上角标签：显示类型（看起来更整洁）
                genreTitleStr = genre; // 例如 "真人秀"
                
                // 2. 副标题：严格执行 "日期 + 季数" 格式
                // 例如 "01-30 S01E04"
                subTitleStr = `${displayDateLabel} ${displayEpLabel}`; 
                
            } else {
                genreTitleStr = `${detail.vote_average.toFixed(1)}分`;
                subTitleStr = `🔥 热度 ${Math.round(detail.popularity)} • ${genre}`;
            }

            return {
                id: String(detail.id),
                tmdbId: detail.id,
                type: "tmdb",
                mediaType: "tv",
                title: detail.name || detail.original_name,
                genreTitle: genreTitleStr, 
                subTitle: subTitleStr,
                posterPath: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : "",
                backdropPath: detail.backdrop_path ? `https://image.tmdb.org/t/p/w780${detail.backdrop_path}` : "",
                description: `📅 更新日期: ${sortDate}\n${detail.overview || "暂无简介"}`,
                rating: detail.vote_average ? detail.vote_average.toFixed(1) : "0.0",
                year: (detail.first_air_date || "").substring(0, 4)
            };
        });

    } catch (e) {
        return [{ id: "err", type: "text", title: "加载失败", subTitle: e.message }];
    }
}
