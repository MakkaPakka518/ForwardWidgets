WidgetMetadata = {
  id: "gemini.platform.originals.pro",
  title: "流媒体·独家原创 (Pro)",
  author: "Gemini",
  description: "v2.0: 全面升级。新增电影/动漫/综艺分类；新增【按更新时间】排序和【每日更新】榜单。",
  version: "2.0.0",
  requiredVersion: "0.0.1",
  modules: [
    {
      title: "独家原创 & 追更日历",
      functionName: "loadPlatformOriginals",
      type: "list",
      requiresWebView: false,
      params: [
        // 1. API Key (保持不变)
        {
          name: "apiKey",
          title: "TMDB API Key (必填)",
          type: "input",
          description: "必须填写TMDB Key",
        },
        // 2. 平台选择 (保持不变)
        {
          name: "network",
          title: "出品平台",
          type: "enumeration",
          value: "213", // Netflix
          enumOptions: [
            { title: "Netflix (网飞)", value: "213" },
            { title: "HBO (黄暴神剧)", value: "49" },
            { title: "Apple TV+ (苹果)", value: "2552" },
            { title: "Disney+ (迪士尼)", value: "2739" },
            { title: "Amazon (亚马逊)", value: "1024" },
            { title: "Hulu", value: "453" },
            { title: "Peacock", value: "3353" },
            { title: "Paramount+", value: "4330" },
            { title: "腾讯视频 (WeTV)", value: "3300" },
            { title: "爱奇艺 (iQIYI)", value: "2444" },
            { title: "哔哩哔哩 (Bilibili)", value: "3785" },
            { title: "TVING (韩剧)", value: "4096" }
          ],
        },
        // 3. 新增：内容类型 (核心升级)
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
        // 4. 排序/功能选择 (升级)
        {
          name: "sortBy",
          title: "排序与功能",
          type: "enumeration",
          value: "popularity.desc",
          enumOptions: [
            { title: "🔥 综合热度", value: "popularity.desc" },
            { title: "⭐ 最高评分 (好评优先)", value: "vote_average.desc" },
            { title: "🆕 最新首播 (按年份)", value: "first_air_date.desc" },
            { title: "📅 按更新时间 (追更模式)", value: "next_episode" },
            { title: "📆 今日播出 (每日榜单)", value: "daily_airing" }
          ],
        },
        // 5. 题材筛选 (作为辅助筛选)
        {
          name: "genre",
          title: "题材筛选 (选填)",
          type: "enumeration",
          value: "",
          enumOptions: [
            { title: "全部题材", value: "" },
            { title: "剧情", value: "18" },
            { title: "科幻 & 奇幻", value: "10765" },
            { title: "动作 & 冒险", value: "10759" },
            { title: "喜剧", value: "35" },
            { title: "犯罪", value: "80" },
            { title: "悬疑", value: "9648" },
            { title: "古装 (需配合国产平台)", value: "10766" }
          ],
        },
      ],
    },
  ],
};

async function loadPlatformOriginals(params) {
  const apiKey = params.apiKey;
  const networkId = params.network || "213";
  const contentType = params.contentType || "tv";
  const sortBy = params.sortBy || "popularity.desc";
  const genreId = params.genre || "";

  if (!apiKey) {
    return [{ title: "缺少 API Key", subTitle: "请在编辑组件中填写 TMDB API Key", type: "text" }];
  }

  // === 1. 构建基础 URL 和参数 ===
  let endpoint = "/discover/tv";
  let queryParams = `&with_networks=${networkId}&language=zh-CN&include_null_first_air_dates=false&page=1`;

  // 根据 contentType 调整策略
  if (contentType === "movie") {
    endpoint = "/discover/movie";
    // 电影没有 first_air_date，只有 release_date，且没有追更概念
    if (sortBy === "first_air_date.desc") queryParams += `&sort_by=release_date.desc`;
    else if (sortBy === "next_episode" || sortBy === "daily_airing") {
       // 电影不支持按集更新，强制回退到热度
       queryParams += `&sort_by=popularity.desc`;
    } else {
       queryParams += `&sort_by=${sortBy}`;
    }
  } else {
    // TV 类 (剧集, 动漫, 综艺)
    
    // 处理特殊分类的 Genre ID
    let finalGenres = genreId;
    if (contentType === "anime") {
        // 动漫 = Genre 16 (动画)
        finalGenres = finalGenres ? `${finalGenres},16` : "16";
    } else if (contentType === "variety") {
        // 综艺 = Genre 10764 (真人秀) 或 10767 (脱口秀)
        // 使用 | (OR) 逻辑
        finalGenres = finalGenres ? `${finalGenres},10764` : "10764|10767";
    }

    if (finalGenres) {
        queryParams += `&with_genres=${finalGenres}`;
    }

    // 处理排序模式
    if (sortBy === "daily_airing") {
        // 📆 每日更新：锁定 Air Date 为今天
        const today = new Date();
        const dateStr = today.toISOString().split("T")[0]; // YYYY-MM-DD
        // 考虑到时区差异，稍微放宽一点点范围也行，这里严格用 TMDB 的 timezone
        queryParams += `&air_date.gte=${dateStr}&air_date.lte=${dateStr}&sort_by=popularity.desc`;
    } else if (sortBy === "next_episode") {
        // 📅 追更模式：先按热度取回来，再本地查详细时间排序
        queryParams += `&sort_by=popularity.desc`; // 先取热门的，再排时间
        // 加上 air_date.gte 过滤掉太老的完结剧？不，有些老剧可能有新番
        // 加上 status=Returning Series? 也可以，但有的 Mini Series 也是连载
        queryParams += `&with_status=0|1|2|3|4|5`; // 全部状态
    } else {
        // 普通排序
        if (sortBy.includes("vote_average")) queryParams += `&vote_count.gte=100`; // 评分人数过滤
        queryParams += `&sort_by=${sortBy}`;
    }
  }

  const url = `https://api.themoviedb.org/3${endpoint}?api_key=${apiKey}${queryParams}`;

  try {
    const res = await Widget.http.get(url);
    let data = res.data || JSON.parse(res.body || "{}");
    let items = data.results || [];

    if (items.length === 0) {
      return [{ title: "该分类下暂无数据", subTitle: "尝试切换平台或类型", type: "text" }];
    }

    // === 2. 高级数据处理 (追更 & 格式化) ===
    
    // 如果是【追更模式】或【TV类】，我们需要获取下一集信息
    // 为了不超限，只处理前 15 个 (Daily 模式通常较少，可以全处理)
    const needDetails = (contentType !== "movie" && (sortBy === "next_episode" || sortBy === "daily_airing"));
    const processCount = needDetails ? 15 : 20;

    const enrichedItems = await Promise.all(items.slice(0, processCount).map(async (item) => {
        let details = null;
        let nextEp = null;
        let lastEp = null;
        
        // 只有 TV 且需要详情时才去查
        if (needDetails) {
             try {
                 const dRes = await Widget.http.get(`https://api.themoviedb.org/3/tv/${item.id}?api_key=${apiKey}&language=zh-CN`);
                 details = dRes.data || JSON.parse(dRes.body || "{}");
                 nextEp = details.next_episode_to_air;
                 lastEp = details.last_episode_to_air;
             } catch(e) {}
        }

        // 计算排序用的时间 (Sort Date)
        let sortDate = "1900-01-01";
        if (nextEp) sortDate = nextEp.air_date;
        else if (lastEp && sortBy === "daily_airing") sortDate = lastEp.air_date; // 每日模式如果是今天播的lastEp也算
        else sortDate = item.first_air_date || item.release_date || "2099-01-01";

        return {
            ...item,
            _details: details,
            _nextEp: nextEp,
            _lastEp: lastEp,
            _sortDate: sortDate,
            _mediaType: contentType === "movie" ? "movie" : "tv"
        };
    }));

    // === 3. 本地排序 (针对 Next Episode) ===
    let finalItems = enrichedItems;
    
    if (sortBy === "next_episode" && contentType !== "movie") {
        // 过滤：只显示有未来/今天剧集的，或者最近更新的
        // 逻辑：有 Next Ep 的排前面 (按时间近到远)，没有的排后面
        finalItems.sort((a, b) => {
            const dateA = new Date(a._sortDate).getTime();
            const dateB = new Date(b._sortDate).getTime();
            
            // 如果都有 Next Ep，谁时间小（越近）谁排前
            if (a._nextEp && b._nextEp) return dateA - dateB;
            // 如果 A 有 B 没有，A 前
            if (a._nextEp && !b._nextEp) return -1;
            if (!a._nextEp && b._nextEp) return 1;
            // 都没有，按热度 (原始顺序)
            return 0; 
        });
    }

    // === 4. 生成卡片 ===
    return finalItems.map(item => buildCard(item, contentType, sortBy));

  } catch (e) {
    return [{ title: "请求失败", subTitle: e.message, type: "text" }];
  }
}

function buildCard(item, contentType, sortBy) {
    const isMovie = contentType === "movie";
    const typeLabel = isMovie ? "影" : (contentType === "anime" ? "漫" : (contentType === "variety" ? "综" : "剧"));
    
    // 图片
    let imagePath = "";
    if (item.backdrop_path) imagePath = `https://image.tmdb.org/t/p/w780${item.backdrop_path}`;
    else if (item.poster_path) imagePath = `https://image.tmdb.org/t/p/w500${item.poster_path}`;

    // 格式化日期
    const formatDate = (str) => {
        if (!str) return "";
        const date = new Date(str);
        if (isNaN(date.getTime())) return str;
        return `${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}`;
    };

    let subTitle = "";
    let genreTitle = "";

    if (!isMovie && (sortBy === "next_episode" || sortBy === "daily_airing")) {
        // 追更/每日模式：显示具体集数信息
        if (item._nextEp) {
            subTitle = `🔜 ${formatDate(item._nextEp.air_date)} 更新 S${item._nextEp.season_number}E${item._nextEp.episode_number}`;
            genreTitle = formatDate(item._nextEp.air_date);
        } else if (item._lastEp) {
             // 可能是刚更完，或者是 Daily 模式下的今日更新
             const isToday = sortBy === "daily_airing"; 
             const prefix = isToday ? "🔥" : "📅";
             subTitle = `${prefix} ${formatDate(item._lastEp.air_date)} 更新 S${item._lastEp.season_number}E${item._lastEp.episode_number}`;
             genreTitle = formatDate(item._lastEp.air_date);
        } else {
             // 没查到详情，或者是新剧
             subTitle = `[${typeLabel}] ${item.first_air_date || "未知日期"}`;
             genreTitle = (item.first_air_date || "").substring(0,4);
        }
    } else {
        // 默认模式 / 电影
        const year = (item.release_date || item.first_air_date || "").substring(0, 4);
        const rating = item.vote_average ? `⭐${item.vote_average.toFixed(1)}` : "";
        
        if (isMovie) {
            subTitle = `🎬 ${year} ${rating}`;
        } else {
            // 如果有详情里的状态，可以显示
            const status = item._details ? (item._details.in_production ? "连载中" : "已完结") : "";
            subTitle = `[${typeLabel}] ${year} ${status} ${rating}`;
        }
        genreTitle = year;
    }

    return {
        id: `${item.id}`,
        tmdbId: item.id,
        type: "tmdb",
        mediaType: isMovie ? "movie" : "tv",
        title: item.name || item.title,
        subTitle: subTitle,
        genreTitle: genreTitle,
        description: item.overview,
        posterPath: imagePath
    };
}
