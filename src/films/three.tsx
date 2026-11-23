// 3D: the product block in Matte, Studio and Keynote, at 9:16 and 16:9.
import { scene, seconds } from "../../examples/scenes/product";
import { filmsFor } from "./blocks/film";

export const FILMS = filmsFor("block-product", scene, seconds, { wide: true, systems: ["matte", "studio", "keynote", "console"] });
