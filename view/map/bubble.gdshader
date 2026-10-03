// Bulle ronde et lisse d'une case : un disque anticrénelé dessiné dans un carré.
// La couleur vient de chaque instance du MultiMesh.
shader_type canvas_item;

void fragment() {
	// Distance au centre : 0 au centre, 1 au bord du disque.
	float distance_to_center = length(UV - vec2(0.5)) * 2.0;
	// Largeur d'un pixel à l'écran, pour un bord net quel que soit le zoom.
	float pixel = fwidth(distance_to_center);
	float alpha = 1.0 - smoothstep(1.0 - pixel, 1.0, distance_to_center);
	COLOR = vec4(COLOR.rgb, COLOR.a * alpha);
}
