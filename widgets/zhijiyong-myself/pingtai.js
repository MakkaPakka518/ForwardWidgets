WidgetMetadata = {
  id: "makka.platform.originals",
  title: "流媒体·独家原创（更新时间版）",
  author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
  description: "各平台独播剧",
  version: "1.0.5",
  requiredVersion: "0.0.1",
  modules: [
    {
      title: "独家原创 & 追更日历",
      functionName: "loadPlatformOriginals",
      type: "list",
      requiresWebView: false,
      params: [
        // 1. 平台选择
        {
          name: "network",
          title: "出品平台",
          type: "enumeration",
          value: "213",
          enumOptions: [
            { title: "Netflix (网飞)", value: "213" },
            { title: "HBO (Max)", value: "49" },
            { title: "Apple TV+", value: "2552" },
            { title: "Disney+", value: "2739" },
            { title: "Amazon Prime", value: "1024" },
            { title: "Hulu", value: "453" },
            { title: "Peacock", value: "3353" },
            { title: "Paramount+", value: "4330" },
            { title: "腾讯视频", value: "2007" },
            { title: "爱奇艺", value: "1330" },
            { title: "Bilibili (B站)", value: "1605" },
            { title: "优酷视频", value: "1419" },
            { title: "芒果TV", value: "1631" },
            { title: "TVING (韩)", value: "4096" }
          ],
        },
        // 2. 内容类型
        {
          name: "contentType",
          title: "内容类型",
          type: "enumeration",
          value: "tv",
          enumOptions: [
            { title: "📺 剧集 (默认)", value: "tv" },
            { title: "🎬 电影", value: "movie" },
            { title: "🌸 动漫/动画", value: "anime" },
            { title: "🎤 综艺/真人秀", value: "variety" }
          ]
        },
        // 3. 排序与功能
        {
          name: "sortBy",
          title: "排序与功能",
          type: "enumeration",
          value: "popularity.desc",
          enumOptions: [
            { title: "🔥 综合热度", value: "popularity.desc" },
            { title: "⭐ 最高评分", value: "vote_average.desc" },
            { title: "🆕 最新首播", value: "first_air_date.desc" },
            { title: "📅 按更新时间 (追更模式)", value: "next_episode" },
            { title: "📆 今日播出 (每日榜单)", value: "daily_airing" }
          ],
        },
        // 4. 页码
        {
          name: "page",
          title: "页码",
          type: "page"
        }
      ],
    },
  ],
};

// ==========================================
// 题材映射表
// ==========================================
const GENRE_MAP = {
    10759: "动作冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片",
    18: "剧情", 10751: "家庭", 10762: "儿童", 9648: "悬疑", 10763: "新闻",
    10764: "真人秀", 10765: "科幻", 10766: "肥皂剧", 10767: "脱口秀",
    10768: "政治", 37: "西部", 28: "动作", 12: "冒险", 14: "奇幻", 
    878: "科幻", 27: "恐怖", 10749: "爱情", 53: "惊悚", 10752: "战争"
};

// ==========================================
// 工具函数
// ==========================================

function formatShortDate(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${m}-${d}`;
}

function getGenreName(ids) {
    if (!ids || ids.length === 0) return "";
    return GENRE_MAP[ids[0]] || "";
}

// ==========================================
// 主逻辑
// ==========================================

async function loadPlatformOriginals(params) {
  const networkId = params.network || "213";
  const contentType = params.contentType || "tv";
  const sortBy = params.sortBy || "popularity.desc";
  const page = params.page || 1;

  let endpoint = "/discover/tv";
  let queryParams = {
      with_networks: networkId,
      language: "zh-CN",
      include_null_first_air_dates: false,
      page: page
  };

  if (contentType === "movie") {
    endpoint = "/discover/movie";
    if (sortBy === "first_air_date.desc") queryParams.sort_by = "release_date.desc";
    else if (sortBy === "next_episode" || sortBy === "daily_airing") queryParams.sort_by = "popularity.desc"; 
    else queryParams.sort_by = sortBy;
  } else {
    // TV 类型
    if (contentType === "anime") queryParams.with_genres = "16"; 
    else if (contentType === "variety") queryParams.with_genres = "10764|10767"; 

    // 排序预处理
    if (sortBy === "daily_airing") {
        const today = new Date().toISOString().split("T")[0]; 
        queryParams["air_date.gte"] = today;
        queryParams["air_date.lte"] = today;
        queryParams.sort_by = "popularity.desc";
    } else if (sortBy === "next_episode") {
        // 追更模式：先按热度取前20个，确保热门剧不漏，然后在本地重排
        queryParams.sort_by = "popularity.desc";
    } else {
        if (sortBy.includes("vote_average")) queryParams["vote_count.gte"] = 100;
        queryParams.sort_by = sortBy;
    }
  }

  try {
    const res = await Widget.tmdb.get(endpoint, { params: queryParams });
    const items = res?.results || [];

    if (items.length === 0) {
      return page === 1 ? [{ title: "暂无数据", subTitle: "尝试切换类型或平台", type: "text" }] : [];
    }

    // === 2. 详情获取与格式化 ===
    
    // 判断是否需要查详细集数
    const needDetails = (contentType !== "movie" && (sortBy === "next_episode" || sortBy === "daily_airing"));
    // 增加处理数量，保证排序基数足够
    const processCount = needDetails ? 20 : 20;

    const processedItems = await Promise.all(items.slice(0, processCount).map(async (item) => {
        let displayStr = ""; 
        let sortDate = "1900-01-01";
        
        // 默认基础信息
        sortDate = item.first_air_date || item.release_date || "2099-01-01";
        const year = sortDate.substring(0, 4);
        const genre = getGenreName(item.genre_ids);
        
        if (needDetails) {
            // 调用 TMDB 详情接口
            try {
                const detail = await Widget.tmdb.get(`/tv/${item.id}`, { params: { language: "zh-CN" } });
                if (detail) {
                    const nextEp = detail.next_episode_to_air;
                    const lastEp = detail.last_episode_to_air;

                    // 核心显示逻辑
                    let targetEp = null;
                    
                    if (nextEp) {
                        targetEp = nextEp;
                    } else if (lastEp) {
                        targetEp = lastEp;
                    }

                    if (targetEp) {
                        sortDate = targetEp.air_date;
                        const dateStr = formatShortDate(sortDate);
                        const epStr = `S${String(targetEp.season_number).padStart(2,'0')}E${String(targetEp.episode_number).padStart(2,'0')}`;
                        // 格式：01-31 S01E04 科幻
                        displayStr = `${dateStr} ${epStr} ${genre}`;
                    } else {
                        // 只有首播信息
                        displayStr = `${formatShortDate(item.first_air_date)} 首播 ${genre}`;
                    }
                }
            } catch(e) {
                displayStr = `${year} ${genre}`;
            }
        } else {
            // 普通模式/电影
            const rating = item.vote_average ? `${item.vote_average.toFixed(1)}分` : "";
            displayStr = `${year} ${genre} ${rating}`;
        }

        return {
            ...item,
            _displayStr: displayStr,
            _sortDate: sortDate
        };
    }));

    // === 3. 严谨的本地排序 (关键修复) ===
    let finalItems = processedItems;
    
    if (sortBy === "next_episode" && contentType !== "movie") {
        const today = new Date().toISOString().split("T")[0]; // 获取今天日期 "2024-05-20"

        finalItems.sort((a, b) => {
            const dateA = a._sortDate;
            const dateB = b._sortDate;

            // 判断是否是未来/今天
            const isAFuture = dateA >= today;
            const isBFuture = dateB >= today;

            // 1. 未来/今天的 排在 过去/完结的 前面
            if (isAFuture && !isBFuture) return -1; 
            if (!isAFuture && isBFuture) return 1;

            // 2. 如果都是未来/今天：按时间正序 (最近的在前: 明天 -> 后天)
            if (isAFuture && isBFuture) {
                if (dateA === dateB) return 0;
                return dateA > dateB ? 1 : -1;
            }

            // 3. 如果都是过去：按时间倒序 (刚播完的在前: 昨天 -> 上周)
            // 或者是按照综艺榜的逻辑，也是正序？
            // 既然是“追更”，通常想看最新的。这里为了整洁，我们把刚播完的放在未来列表的紧下方。
            if (dateA === dateB) return 0;
            return dateB > dateA ? 1 : -1; 
        });
    }

    return finalItems.map(item => buildCard(item, contentType));

  } catch (e) {
    return [{ title: "请求失败", subTitle: e.message, type: "text" }];
  }
}

function buildCard(item, contentType) {
    const isMovie = contentType === "movie";
    
    // 图片
    let imagePath = "";
    if (item.backdrop_path) imagePath = `https://image.tmdb.org/t/p/w780${item.backdrop_path}`;
    else if (item.poster_path) imagePath = `https://image.tmdb.org/t/p/w500${item.poster_path}`;

    // 使用拼接好的字符串
    const displayStr = item._displayStr || "";

    return {
        id: String(item.id),
        tmdbId: parseInt(item.id),
        type: "tmdb",
        mediaType: isMovie ? "movie" : "tv",
        title: item.name || item.title || item.original_name,
        
        // 左下角：01-31 S01E04 科幻
        subTitle: displayStr, 
        // 右上角：01-31 S01E04 科幻
        genreTitle: displayStr, 
        
        description: item.overview || "暂无简介",
        posterPath: imagePath
    };
}
