// ==========================================
// 豆瓣同步 & 追更排序 (独立复刻版)
// ==========================================
WidgetMetadata = {
  id: "douban_sync_pro_standalone",
  title: "豆瓣同步 & 追更排序",
  author: "Gemini",
  description: "复刻原版豆瓣接口抓取逻辑，增加按剧集更新时间排序功能。",
  // 建议使用 poster 类型显示
  modules: [
    {
      title: "豆瓣片单 Pro",
      requiresWebView: false,
      functionName: "loadDoubanSync",
      type: "list", 
      cacheDuration: 3600,
      params: [
        {
          name: "user_id",
          title: "豆瓣 ID (必填)",
          type: "input",
          description: "数字ID或个性域名ID (如: 1234567)",
        },
        {
          name: "status",
          title: "筛选状态",
          type: "enumeration",
          defaultValue: "mark",
          enumOptions: [
            { title: "想看 (Mark)", value: "mark" },
            { title: "在看 (Doing)", value: "doing" },
            { title: "看过 (Done)", value: "done" }
          ],
        },
        {
          name: "sort_mode",
          title: "排序模式",
          type: "enumeration",
          defaultValue: "default",
          enumOptions: [
            { title: "📌 默认 (豆瓣原序)", value: "default" },
            { title: "📅 按更新时间 (追更)", value: "update" }, // 适合“在看”
            { title: "🆕 按上映年份", value: "release" }
          ]
        },
        {
          name: "page",
          title: "页码",
          type: "page"
        }
      ],
    }
  ],
};

// ==========================================
// 1. 核心抓取逻辑 (严格复刻原版)
// ==========================================

// 严格使用原脚本的 Header，防止 403 Forbidden
const DOUBAN_HEADERS = {
  "Referer": "https://m.douban.com/movie",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
};

async function loadDoubanSync(params) {
  const { user_id, status = "mark", sort_mode = "default", page = 1 } = params;

  if (!user_id) {
    return [{ title: "请配置豆瓣ID", subTitle: "点击组件右上角编辑参数", type: "text" }];
  }

  // --- Step 1: 构造 URL (完全模仿原逻辑) ---
  const count = 15;
  const start = (page - 1) * count;
  // 关键：for_mobile=1 和 ck= 参数必须保留
  const url = `https://m.douban.com/rexxar/api/v2/user/${user_id}/interests?type=${status}&count=${count}&order_by=time&start=${start}&ck=&for_mobile=1`;

  try {
    // --- Step 2: 发起请求 ---
    console.log(`正在请求豆瓣: ${url}`);
    const res = await Widget.http.get(url, { headers: DOUBAN_HEADERS });
    
    // 解析数据 (兼容 body 和 data)
    let data = null;
    if (typeof res.body === 'string') {
        data = JSON.parse(res.body);
    } else if (typeof res.data === 'object') {
        data = res.data;
    } else if (typeof res.data === 'string') {
        data = JSON.parse(res.data);
    }

    // 错误检查
    if (!data) throw new Error("返回数据为空");
    if (data.msg === "user_not_found") return [{ title: "用户不存在", subTitle: "请检查ID是否正确", type: "text" }];
    if (data.interests && data.interests.length === 0) return [{ title: "列表为空", subTitle: "没有更多数据了", type: "text" }];

    // --- Step 3: 数据清洗 ---
    const interests = data.interests || [];
    let items = interests.map(i => {
      const subject = i.subject || {};
      const isMovie = subject.type === "movie";
      // 封面图处理：优先取 large
      const poster = subject.pic?.large || subject.pic?.normal || subject.cover_url || "";
      
      return {
        doubanId: subject.id,
        title: subject.title,
        original_title: subject.original_title,
        year: subject.year,
        pic: poster,
        rating: subject.rating?.value || "0.0",
        type: isMovie ? "movie" : "tv",
        comment: i.comment,
        create_time: i.create_time, // 豆瓣标记时间
        
        // 初始化排序字段
        sortDate: "1900-01-01", 
        displayTime: "" 
      };
    });

    // --- Step 4: 高级排序 (如需) ---
    if (sort_mode !== "default") {
      // 如果不是默认排序，去查 TMDB 时间
      items = await enrichAndTimeSort(items, sort_mode);
    }

    // --- Step 5: 输出 ---
    return items.map(item => buildCard(item, sort_mode));

  } catch (e) {
    console.error(e);
    return [{ title: "请求失败", subTitle: e.message || "网络或API错误", type: "text" }];
  }
}

// ==========================================
// 2. 时间查询与排序 (增强部分)
// ==========================================

async function enrichAndTimeSort(items, sortMode) {
    // 1. 并发查询 TMDB 信息
    const tasks = items.map(async (item) => {
        try {
            // A. 搜索 (用中文标题搜 TMDB)
            const searchRes = await Widget.tmdb.search(item.title, item.type, { language: "zh-CN" });
            const results = searchRes.results || [];
            
            // B. 匹配年份 (防止同名)
            let match = null;
            if (results.length > 0) {
                const targetYear = parseInt(item.year);
                match = results.find(r => {
                    const rDate = r.first_air_date || r.release_date || "0000";
                    const rYear = parseInt(rDate.substring(0, 4));
                    return Math.abs(rYear - targetYear) <= 2; // 允许误差
                });
                if (!match) match = results[0];
            }

            if (match) {
                item.tmdbId = match.id;
                
                // C. 获取具体日期
                if (item.type === "tv") {
                    // 剧集：查详情看下集/上集
                    const detail = await Widget.tmdb.get(`/tv/${match.id}`, { params: { language: "zh-CN" } });
                    
                    if (sortMode === "update") {
                        // 追更模式：优先看 Next Episode
                        const nextEp = detail.next_episode_to_air;
                        const lastEp = detail.last_episode_to_air;
                        
                        if (nextEp) {
                            item.sortDate = nextEp.air_date;
                            item.displayTime = `🔜 ${formatDate(nextEp.air_date)} S${nextEp.season_number}E${nextEp.episode_number}`;
                        } else if (lastEp) {
                            item.sortDate = lastEp.air_date;
                            item.displayTime = `🔥 ${formatDate(lastEp.air_date)} S${lastEp.season_number}E${lastEp.episode_number}`;
                        } else {
                            item.sortDate = detail.first_air_date || "1900-01-01";
                            item.displayTime = `${formatDate(item.sortDate)} 首播`;
                        }
                    } else {
                        // 默认按首播
                        item.sortDate = detail.first_air_date || "1900-01-01";
                        item.displayTime = `📅 ${item.year}`;
                    }
                } else {
                    // 电影
                    item.sortDate = match.release_date || "1900-01-01";
                    item.displayTime = `🎬 ${formatDate(item.sortDate)}`;
                }
            }
        } catch(e) { console.log("Search error: " + item.title); }
        
        return item;
    });

    // 等待所有查询完成
    const enrichedItems = await Promise.all(tasks);

    // 2. 执行本地排序
    enrichedItems.sort((a, b) => {
        // 简单日期字符串比较 "2024-02-01" vs "2024-01-01"
        if (a.sortDate === b.sortDate) return 0;
        // 倒序：时间晚（新）的在前面
        return a.sortDate < b.sortDate ? 1 : -1;
    });

    return enrichedItems;
}

// ==========================================
// 3. UI 构建
// ==========================================

function buildCard(item, sortMode) {
    let subTitle = "";
    let genreTitle = "";

    if (sortMode !== "default" && item.displayTime) {
        // 排序模式下，显示时间
        subTitle = item.displayTime;
        genreTitle = item.rating > 0 ? `${item.rating}` : item.year;
    } else {
        // 默认模式
        subTitle = item.original_title || "";
        if (item.comment) subTitle = `💬 ${item.comment}`; // 有短评显示短评
        genreTitle = item.rating > 0 ? `${item.rating}分` : item.year;
    }

    return {
        id: `db_${item.doubanId}`,
        // 传入 tmdbId 以支持 App 内的资源搜索/跳转
        tmdbId: item.tmdbId || null,
        type: "tmdb",
        mediaType: item.type,
        
        title: item.title,
        subTitle: subTitle,
        genreTitle: String(genreTitle),
        
        posterPath: item.pic,
        description: item.original_title || "暂无描述",
        // 兜底链接
        url: `https://m.douban.com/${item.type}/${item.doubanId}/`
    };
}

// 辅助：日期格式化 (2024-05-01 -> 05-01)
function formatDate(dateStr) {
    if (!dateStr) return "";
    return dateStr.substring(5);
}
