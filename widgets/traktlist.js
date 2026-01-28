WidgetMetadata = {
    id: "trakt_personal_pro_v3",
    title: "Trakt 个人中心 (追剧增强)",
    author: "MakkaPakka",
    description: "管理 Trakt 片单。追剧日历支持【按更新时间/观看时间】排序，直观展示更新日期。",
    version: "4.1.0",
    requiredVersion: "0.0.1",
    site: "https://trakt.tv",

    globalParams: [
        { name: "traktUser", title: "Trakt 用户名 (必填)", type: "input", description: "你的 Trakt ID (Slug)", value: "" },
        { name: "traktClientId", title: "Trakt Client ID (必填)", type: "input", value: "" }
    ],

    modules: [
        {
            title: "我的片单",
            functionName: "loadTraktProfile",
            type: "list",
            cacheDuration: 300,
            params: [
                {
                    name: "section",
                    title: "浏览区域",
                    type: "enumeration",
                    value: "watchlist",
                    enumOptions: [
                        { title: "📅 追剧日历", value: "updates" }, 
                        { title: "📜 待看列表 (Watchlist)", value: "watchlist" },
                        { title: "📦 收藏列表 (Collection)", value: "collection" },
                        { title: "🕒 观看历史 (History)", value: "history" },
                        { title: "⭐ 评分记录 (Ratings)", value: "ratings" }
                    ]
                },
                // 追剧日历专用排序
                {
                    name: "updateSort",
                    title: "追剧排序",
                    type: "enumeration",
                    value: "air_date",
                    belongTo: { paramName: "section", value: ["updates"] },
                    enumOptions: [
                        { title: "按更新时间 (最近更新)", value: "air_date" },
                        { title: "按观看时间 (最近观看)", value: "watched_at" }
                    ]
                },
                // 其他列表的筛选
                {
                    name: "type",
                    title: "内容筛选",
                    type: "enumeration",
                    value: "all",
                    belongTo: { paramName: "section", value: ["watchlist", "collection", "history", "ratings"] },
                    enumOptions: [ { title: "全部", value: "all" }, { title: "剧集", value: "shows" }, { title: "电影", value: "movies" } ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        }
    ]
};

async function loadTraktProfile(params = {}) {
    const { traktUser, traktClientId, section, updateSort = "air_date", type = "all", page = 1 } = params;

    if (!traktUser || !traktClientId) return [{ id: "err", type: "text", title: "请填写用户名和Client ID" }];

    // === A. 追剧日历 (Updates) ===
    if (section === "updates") {
        // 1. 获取最近观看的 100 部剧
        const url = `https://api.trakt.tv/users/${traktUser}/watched/shows?extended=noseasons&limit=100`;
        
        try {
            const res = await Widget.http.get(url, {
                headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": traktClientId }
            });
            const data = res.data || [];
            if (data.length === 0) return [{ id: "empty", type: "text", title: "没有观看记录" }];

            // 2. 并发请求 TMDB (获取更新信息)
            const enrichedShows = await Promise.all(data.slice(0, 60).map(async (item) => {
                if (!item.show?.ids?.tmdb) return null;
                const tmdb = await fetchTmdbShowDetails(item.show.ids.tmdb);
                if (!tmdb) return null;
                
                // 提取关键时间点
                const lastAir = tmdb.last_episode_to_air?.air_date || "1970-01-01";
                const nextAir = tmdb.next_episode_to_air?.air_date || "2099-12-31";
                const lastWatched = item.last_watched_at || "1970-01-01";

                return {
                    trakt: item,
                    tmdb: tmdb,
                    // 排序依据
                    airDate: lastAir,
                    watchedDate: lastWatched
                };
            }));

            // 3. 本地排序
            const validShows = enrichedShows.filter(Boolean);
            
            if (updateSort === "air_date") {
                // 按更新时间倒序 (最近更新的在前)
                validShows.sort((a, b) => new Date(b.airDate) - new Date(a.airDate));
            } else {
                // 按观看时间倒序 (最近看的在前)
                validShows.sort((a, b) => new Date(b.watchedDate) - new Date(a.watchedDate));
            }

            // 4. 分页切片
            const pageSize = 15;
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            if (start >= validShows.length) return [];
            
            return validShows.slice(start, end).map(item => {
                const d = item.tmdb;
                const year = (d.first_air_date || "").substring(0, 4);
                
                // 构造显示信息
                let dateLabel = "";
                let episodeInfo = "";
                
                // 优先显示下一集，其次显示最新一集
                if (d.next_episode_to_air) {
                    dateLabel = `🔜 ${d.next_episode_to_air.air_date}`;
                    episodeInfo = `S${d.next_episode_to_air.season_number}E${d.next_episode_to_air.episode_number} · ${d.next_episode_to_air.name || "待定"}`;
                } else if (d.last_episode_to_air) {
                    dateLabel = `📅 ${d.last_episode_to_air.air_date}`; // UI核心：显示日期
                    episodeInfo = `S${d.last_episode_to_air.season_number}E${d.last_episode_to_air.episode_number} · ${d.last_episode_to_air.name}`;
                } else {
                    dateLabel = "暂无排期";
                    episodeInfo = "已完结或未定档";
                }

                return {
                    id: String(d.id), tmdbId: d.id, type: "tmdb", mediaType: "tv",
                    title: d.name,
                    
                    // 【修改点】genreTitle 显示日期
                    genreTitle: dateLabel, 
                    
                    // 【修改点】subTitle 显示集数
                    subTitle: episodeInfo,
                    
                    posterPath: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : "",
                    backdropPath: d.backdrop_path ? `https://image.tmdb.org/t/p/w780${d.backdrop_path}` : "",
                    description: `上次观看: ${item.trakt.last_watched_at.split("T")[0]}\n${d.overview}`,
                    rating: d.vote_average?.toFixed(1)
                };
            });

        } catch (e) { return [{ id: "err", type: "text", title: "加载失败", subTitle: e.message }]; }
    }

    // === B. 常规列表 (Watchlist/History...) ===
    // (这部分逻辑保持不变，支持混合模式)
    let rawItems = [];
    // ... (此处省略常规列表代码，与之前完全一致)
    // 为节省篇幅，建议直接复用上一版关于 Watchlist/History 的代码块
    // 只要把上面的 Updates 逻辑替换进去即可
    
    // 临时补充常规代码以保证完整性：
    if (type === "all") {
        const [movies, shows] = await Promise.all([
            fetchTraktList(section, "movies", "added,desc", page, traktUser, traktClientId),
            fetchTraktList(section, "shows", "added,desc", page, traktUser, traktClientId)
        ]);
        rawItems = [...movies, ...shows];
        // 混合排序逻辑略...
    } else {
        rawItems = await fetchTraktList(section, type, "added,desc", page, traktUser, traktClientId);
    }
    
    // ... 常规渲染逻辑 ...
    if (!rawItems || rawItems.length === 0) return page === 1 ? [{ id: "empty", type: "text", title: "列表为空" }] : [];
    
    const promises = rawItems.map(async (item) => {
        const subject = item.show || item.movie || item;
        const mediaType = item.show ? "tv" : "movie";
        if (!subject?.ids?.tmdb) return null;
        let subInfo = `Trakt: ${subject.year || ""}`;
        if (type === "all") subInfo = `[${mediaType === "tv" ? "剧集" : "电影"}] ${subInfo}`;
        return await fetchTmdbDetail(subject.ids.tmdb, mediaType, subInfo, subject.title);
    });
    return (await Promise.all(promises)).filter(Boolean);
}

// 辅助函数
async function fetchTmdbShowDetails(id) {
    try {
        const res = await Widget.tmdb.get(`/tv/${id}`, { params: { language: "zh-CN" } });
        return res;
    } catch (e) { return null; }
}

async function fetchTraktList(section, type, sort, page, user, id) {
    // ... (同前)
    try {
        const res = await Widget.http.get(`https://api.trakt.tv/users/${user}/${section}/${type}?limit=15&page=${page}`, {
            headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": id }
        });
        return res.data || [];
    } catch (e) { return []; }
}

// ... fetchTmdbDetail 等其他辅助函数同前
async function fetchTmdbDetail(id, type, subInfo, originalTitle) {
    try {
        const d = await Widget.tmdb.get(`/${type}/${id}`, { params: { language: "zh-CN" } });
        const year = (d.first_air_date || d.release_date || "").substring(0, 4);
        return {
            id: String(d.id), tmdbId: d.id, type: "tmdb", mediaType: type,
            title: d.name || d.title || originalTitle,
            genreTitle: year, // 常规列表只显示年份
            subTitle: subInfo,
            posterPath: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : "",
            rating: d.vote_average?.toFixed(1)
        };
    } catch (e) { return null; }
}
