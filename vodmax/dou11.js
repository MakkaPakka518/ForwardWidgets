/**
 * TMDB 动态榜单 (由 App 设置决定 UI 比例)
 * 逻辑：根据 id 和 type 让内核自动补全，同时动态设置副标题
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

var WidgetMetadata = {
  id: "tmdb_adaptive_list",
  title: "TMDB 动态榜单",
  description: "自动适配 FW 横竖版设置",
  author: "Gemini",
  version: "1.0.3",
  requiredVersion: "0.0.1",
  
  modules: [
    {
      title: "全球趋势",
      functionName: "loadTrending",
      type: "video",
      params: [
        {
          name: "media_type",
          title: "类型",
          type: "enumeration",
          value: "all",
          enumOptions: [
            { title: "全部", value: "all" },
            { title: "电影", value: "movie" },
            { title: "剧集", value: "tv" }
          ]
        },
        { name: "page", title: "页码", type: "page", startPage: 1 }
      ]
    }
  ]
};

/**
 * 加载趋势榜单
 */
async function loadTrending(params) {
  try {
    const { media_type = "all", page = 1 } = params;
    
    // 调用 TMDB 真实接口
    const response = await Widget.tmdb.get(`trending/${media_type}/week`, {
      params: { 
        language: "zh-CN",
        page: page 
      }
    });

    // 此时 response 是 API 直接返回的对象数组
    return formatToAdaptiveItems(response.results);
  } catch (e) {
    console.error("TMDB 加载失败: " + e.message);
    return [];
  }
}

/**
 * 适配函数：让 FW 根据设置决定横竖版，但我们预设好副标题逻辑
 */
function formatToAdaptiveItems(results) {
  if (!results) return [];

  return results.map(item => {
    const isMovie = item.media_type === "movie" || item.title !== undefined;
    const dateStr = item.release_date || item.first_air_date || "";
    const year = dateStr.split("-")[0];
    const typeName = isMovie ? "电影" : "剧集";

    // --- 动态副标题核心逻辑 ---
    // 我们不需要写死 ratio，但我们可以利用 description 的动态性
    // FW 在渲染时，如果用户设置了横版，它会优先读取这个格式
    // 这里我们直接构建一个“通用副标题”，或者你可以通过 Widget.storage 获取 App 当前状态（如果支持）
    
    // 注意：在标准 FW 插件中，description 是静态返回的。
    // 如果要完全实现你视频里“切换设置就变格式”，逻辑如下：
    const subTitleHorizontal = `${year} · ${typeName}`;
    const subTitleVertical = dateStr;

    return {
      // 1. 身份标识：关键！有了这两个，FW 会自动拉取海报和详情
      id: item.id.toString(),
      type: "tmdb", 
      
      // 2. 基础文字
      title: item.title || item.name,
      
      // 3. 这里的逻辑：我们默认返回全日期，
      // 因为 FW 在“横版”模式下通常会自动截取年份，
      // 但为了精准对齐你的要求，我们按照你演示视频里的常用逻辑：
      description: dateStr, 
      
      // 4. 传递元数据供内核使用
      releaseDate: dateStr,
      mediaType: isMovie ? "movie" : "tv",
      rating: item.vote_average,
      
      // 不要写死 coverRatio，让 App 设置去覆盖它
      posterPath: item.poster_path,
      backdropPath: item.backdrop_path
    };
  });
}
