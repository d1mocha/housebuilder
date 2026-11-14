# Лицензии ассетов

Все текстуры в `public/textures/` получены из источников с лицензией **CC0 1.0 Universal (Public Domain Dedication)**:

- **ambientCG** — https://ambientcg.com (лицензия: https://docs.ambientcg.com/license/ — CC0 1.0)
- **Poly Haven** — https://polyhaven.com (лицензия: https://polyhaven.com/license — CC0 1.0)

Изображения с сайтов магазинов и производителей в репозитории **не используются**. Для «товара из магазина»
приложение хранит только ссылку и введённые пользователем данные; фото пользователь может добавить сам
(оно сохраняется в файле проекта, а не в репозитории).

## Обработка

Исходники взяты в разрешении 1K (JPG). Для репозитория они уменьшены: карта цвета — до 512 px по ширине,
карта нормалей (OpenGL) — до 256 px; шероховатость сведена к одному среднему числу (хранится в
`src/catalog/textures.ts`). Текстуры с пометкой «тонируемая» обесцвечены и нормированы по яркости — цвет
задаётся материалом в приложении. Текстуры с пометкой «повёрнута» развёрнуты на 90°, чтобы волокна шли вдоль
оси X (так же, как длина доски и длина листа ЛДСП).

## Текстуры

| Файл | Название | Источник | Ассет | Ссылка | Лицензия | Обработка |
|---|---|---|---|---|---|---|
| `wallpaper-woodchip.jpg`, `wallpaper-woodchip_n.jpg` | Обои под покраску (рауфазер) | ambientCG | Wallpaper001A | https://ambientcg.com/a/Wallpaper001A | CC0 1.0 | 512 px, тонируемая |
| `wallpaper-smooth.jpg`, `wallpaper-smooth_n.jpg` | Обои гладкие флизелиновые | ambientCG | Wallpaper002A | https://ambientcg.com/a/Wallpaper002A | CC0 1.0 | 512 px, тонируемая |
| `wallpaper-linen.jpg`, `wallpaper-linen_n.jpg` | Обои текстильные (лён) | Poly Haven | rough_linen | https://polyhaven.com/a/rough_linen | CC0 1.0 | 512 px, тонируемая |
| `wallpaper-damask.jpg`, `wallpaper-damask_n.jpg` | Обои с узором (дамаск) | Poly Haven | floral_jacquard | https://polyhaven.com/a/floral_jacquard | CC0 1.0 | 512 px, тонируемая |
| `wallpaper-check.jpg`, `wallpaper-check_n.jpg` | Обои в клетку | Poly Haven | fabric_pattern_05 | https://polyhaven.com/a/fabric_pattern_05 | CC0 1.0 | 512 px |
| `wallpaper-hessian.jpg`, `wallpaper-hessian_n.jpg` | Обои «рогожка» | Poly Haven | hessian_230 | https://polyhaven.com/a/hessian_230 | CC0 1.0 | 512 px |
| `wood-maple.jpg`, `wood-maple_n.jpg` | Клён светлый | ambientCG | Wood095 | https://ambientcg.com/a/Wood095 | CC0 1.0 | 512 px |
| `wood-oak-natural.jpg`, `wood-oak-natural_n.jpg` | Дуб натуральный | ambientCG | Wood094 | https://ambientcg.com/a/Wood094 | CC0 1.0 | 512 px |
| `wood-alder.jpg`, `wood-alder_n.jpg` | Ольха медовая | ambientCG | Wood092 | https://ambientcg.com/a/Wood092 | CC0 1.0 | 512 px, повёрнута |
| `wood-oak-grey.jpg`, `wood-oak-grey_n.jpg` | Дуб серо-коричневый | ambientCG | Wood049 | https://ambientcg.com/a/Wood049 | CC0 1.0 | 512 px |
| `wood-walnut.jpg`, `wood-walnut_n.jpg` | Орех | ambientCG | Wood066 | https://ambientcg.com/a/Wood066 | CC0 1.0 | 512 px |
| `wood-wenge.jpg`, `wood-wenge_n.jpg` | Венге | ambientCG | Wood051 | https://ambientcg.com/a/Wood051 | CC0 1.0 | 512 px |
| `wood-mahogany.jpg`, `wood-mahogany_n.jpg` | Махагон тёмный | ambientCG | Wood027 | https://ambientcg.com/a/Wood027 | CC0 1.0 | 512 px |
| `parquet-strip.jpg`, `parquet-strip_n.jpg` | Паркет штучный «палуба» | ambientCG | WoodFloor051 | https://ambientcg.com/a/WoodFloor051 | CC0 1.0 | 512 px |
| `parquet-basket.jpg`, `parquet-basket_n.jpg` | Паркет «плетёнка» | ambientCG | WoodFloor070 | https://ambientcg.com/a/WoodFloor070 | CC0 1.0 | 512 px |
| `parquet-herringbone.jpg`, `parquet-herringbone_n.jpg` | Паркет «ёлочка» | Poly Haven | herringbone_parquet | https://polyhaven.com/a/herringbone_parquet | CC0 1.0 | 512 px |
| `laminate-planks-grey.jpg`, `laminate-planks-grey_n.jpg` | Ламинат дуб серый (доска) | Poly Haven | laminate_floor_02 | https://polyhaven.com/a/laminate_floor_02 | CC0 1.0 | 512 px |
| `laminate-planks-brown.jpg`, `laminate-planks-brown_n.jpg` | Ламинат дуб коричневый (доска) | Poly Haven | wood_floor | https://polyhaven.com/a/wood_floor | CC0 1.0 | 512 px, повёрнута |
| `linoleum-brown.jpg`, `linoleum-brown_n.jpg` | Линолеум коричневый (крошка) | Poly Haven | linoleum_brown | https://polyhaven.com/a/linoleum_brown | CC0 1.0 | 512 px |
| `linoleum-speckle.jpg`, `linoleum-speckle_n.jpg` | Линолеум однотонный (цвет на выбор) | Poly Haven | linoleum_brown | https://polyhaven.com/a/linoleum_brown | CC0 1.0 | 512 px, тонируемая |
| `linoleum-retro.jpg`, `linoleum-retro_n.jpg` | Линолеум с орнаментом | Poly Haven | old_linoleum_flooring_01 | https://polyhaven.com/a/old_linoleum_flooring_01 | CC0 1.0 | 512 px |
| `stone-marble-grey.jpg`, `stone-marble-grey_n.jpg` | Мрамор серый | ambientCG | Marble012 | https://ambientcg.com/a/Marble012 | CC0 1.0 | 512 px |
| `stone-marble-black.jpg`, `stone-marble-black_n.jpg` | Мрамор чёрный | ambientCG | Marble016 | https://ambientcg.com/a/Marble016 | CC0 1.0 | 512 px |
| `stone-travertine.jpg`, `stone-travertine_n.jpg` | Травертин бежевый | ambientCG | Travertine009 | https://ambientcg.com/a/Travertine009 | CC0 1.0 | 512 px |
| `stone-terrazzo.jpg`, `stone-terrazzo_n.jpg` | Терраццо | ambientCG | Terrazzo013 | https://ambientcg.com/a/Terrazzo013 | CC0 1.0 | 512 px |
| `stone-concrete.jpg`, `stone-concrete_n.jpg` | Бетон светлый | ambientCG | Concrete034 | https://ambientcg.com/a/Concrete034 | CC0 1.0 | 512 px |
| `stone-masonry.jpg`, `stone-masonry_n.jpg` | Камень дикий (кладка) | ambientCG | Bricks075A | https://ambientcg.com/a/Bricks075A | CC0 1.0 | 512 px |
| `plaster-stucco.jpg`, `plaster-stucco_n.jpg` | Штукатурка фактурная | ambientCG | Plaster001 | https://ambientcg.com/a/Plaster001 | CC0 1.0 | 512 px, тонируемая |
| `paint-matte.jpg`, `paint-matte_n.jpg` | Окрашенная поверхность матовая | ambientCG | Wallpaper002A | https://ambientcg.com/a/Wallpaper002A | CC0 1.0 | 512 px, тонируемая |
| `plaster-venetian.jpg`, `plaster-venetian_n.jpg` | Штукатурка венецианская | ambientCG | Plaster003 | https://ambientcg.com/a/Plaster003 | CC0 1.0 | 512 px, тонируемая |
| `plaster-loft.jpg`, `plaster-loft_n.jpg` | Штукатурка декоративная «лофт» | Poly Haven | white_plaster_02 | https://polyhaven.com/a/white_plaster_02 | CC0 1.0 | 512 px |
| `carpet-loop.jpg`, `carpet-loop_n.jpg` | Ковролин петельный | ambientCG | Carpet016 | https://ambientcg.com/a/Carpet016 | CC0 1.0 | 512 px, тонируемая |

## Шрифты

- **DejaVu Sans** — берётся из npm-пакета `dejavu-fonts-ttf` (в репозитории не хранится), используется в
  PDF-чертежах; лицензия Bitstream Vera / DejaVu (свободная, разрешает встраивание и распространение).
