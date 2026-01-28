WidgetMetadata = {
    id: "my_trakt_hub",
    title: "Trakt 个人中心",
    author: "MakkaPakka",
    description: "同步你的 Trakt 待看列表 (Watchlist) 和在追剧集 (Progress)。",
    version: "1.0.0",
    requiredVersion: "0.0.1",
    site: "https://trakt.tv",

    // 1. 全局参数
    globalParams: [
        {
            name: "traktUser",
            title: "Trakt 用户名 (必填)",
            type: "input",
            description: "你的 Trakt ID (Slug)",
            value: ""
        },
        {
            name: "traktClientId",
            title: "Trakt Client ID (选填)",
            type: "input",
            description: "默认使用公共 ID。",
            value: ""
        }
    ],

    modules: [
        {
            title: "我的片单",
            functionName: "loadMyTrakt",
            type: "list",
            cacheDuration: 600, // 10分钟刷新一次，保证进度同步
            params: [
                {
                    name: "listType",
                    title: "列表类型",
                    type: "enumeration",
                    value: "watchlist",
                    enumOptions: [
                        { title: "📺 在追剧集 (Next Episode)", value: "progress" },
                        { title: "📜 待看列表 (Watchlist)", value: "watchlist" },
                        { title: "⭐ 收藏夹 (Collection)", value: "collection" },
                        { title: "🕒 历史记录 (History)", value: "history" }
                    ]
                },
                {
                    name: "type",
                    title: "内容筛选",
                    type: "enumeration",
                    value: "shows",
                    belongTo: { paramName: "listType", value: ["watchlist", "collection", "history"] },
                    enumOptions: [
                        { title: "剧集", value: "shows" },
                        { title: "电影", value: "movies" }
                    ]
                }
            ]
        }
    ]
};

const DEFAULT_TRAKT_ID = "003666572e92c4331002a28114387693994e43f5454659f81640a232f08a5996";

async function loadMyTrakt(params = {}) {
    const { traktUser, listType = "watchlist", type = "shows" } = params;
    const clientId = params.traktClientId || DEFAULT_TRAKT_ID;

    if (!traktUser) return [{ id: "err", type: "text", title: "请填写 Trakt 用户名" }];

    let url = "";
    
    // 1. 在追列表 (Progress) - 最复杂的接口
    // /users/{username}/watched/shows?extended=noseasons
    // 需要配合 watched 接口算出进度，或者使用 hidden progress 接口
    // 简单方案：获取 Watched，然后对每个 show 获取 next_episode
    // 但这需要 OAuth。公开接口只能获取 Watched List，无法直接获取 Next Episode。
    // 替代方案：获取 "On Deck" (需要 OAuth)。
    // 公开方案：获取 "Watched" 列表，按最后观看时间排序。
    if (listType === "progress") {
        url = `https://api.trakt.tv/users/${traktUser}/watched/shows?extended=full`;
    } 
    // 2. 待看列表 (Watchlist)
    else if (listType === "watchlist") {
        url = `https://api.trakt.tv/users/${traktUser}/watchlist/${type}/rank?extended=full`;
    }
    // 3. 收藏/历史
    else {
        url = `https://api.trakt.tv/users/${traktUser}/${listType}/${type}?extended=full`;
    }

    console.log(`[Trakt] Fetching: ${url}`);

    try {
        const res = await Widget.http.get(url, {
            headers: { 
                "Content-Type": "application/json", 
                "trakt-api-version": "2", 
                "trakt-api-key": clientId 
            }
        });
        
        const data = res.data || [];
        if (!Array.isArray(data)) return [{ id: "err", type: "text", title: "Trakt 响应错误" }];
        if (data.length === 0) return [{ id: "empty", type: "text", title: "列表为空" }];

        // 处理数据并匹配 TMDB
        // 限制 20 个，防止并发过多
        const promises = data.slice(0, 20).map(async (item) => {
            const subject = item.show || item.movie;
            if (!subject || !subject.ids || !subject.ids.tmdb) return null;

            // 构造副标题
            let subTitle = "";
            if (listType === "progress") {
                // 对于在追列表，显示 "上次观看: S1E1"
                // item 结构: { plays, last_watched_at, show, seasons }
                // 由于公开接口没有 next_episode，我们只能显示 "上次观看时间"
                const date = item.last_watched_at.split("T")[0];
                subTitle = `上次观看: ${date}`;
            } else {
                subTitle = subject.year ? `${subject.year}` : "";
            }

            return await fetchTmdbDetail(subject.ids.tmdb, type === "movies" ? "movie" : "tv", subTitle, subject.title);
        });

        return (await Promise.all(promises)).filter(Boolean);

    } catch (e) {
        return [{ id: "err_net", type: "text", title: "请求失败", subTitle: e.message }];
    }
}

// 辅助：TMDB 详情 (免 Key)
async function fetchTmdbDetail(id, type, subInfo, originalTitle) {
    try {
        const d = await Widget.tmdb.get(`/${type}/${id}`, { params: { language: "zh-CN" } });
        
        const year = (d.first_air_date || d.release_date || "").substring(0, 4);
        const genreText = (d.genres || []).map(g => g.name).slice(0, 2).join(" / ");
        
        return {
            id: String(d.id),
            tmdbId: d.id,
            type: "tmdb",
            mediaType: type,
            
            title: d.name || d.title || originalTitle,
            genreTitle: [year, genreText].filter(Boolean).join(" • "),
            subTitle: subInfo,
            description: d.overview || "暂无简介",
            
            posterPath: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : "",
            backdropPath: d.backdrop_path ? `https://image.tmdb.org/t/p/w780${d.backdrop_path}` : "",
            rating: d.vote_average?.toFixed(1),
            year: year
        };
    } catch (e) { return null; }
}
