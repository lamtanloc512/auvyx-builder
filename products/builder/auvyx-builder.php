<?php
/**
 * Plugin Name:       Auvyx Builder
 * Plugin URI:        https://auvyx.org/
 * Description:       Block-native visual builder: responsive styles, design tokens and layout blocks for block themes.
 * Version:           1.0.0
 * Requires at least: 6.7
 * Requires PHP:      7.4
 * Author:            Auvyx
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       auvyx-builder
 * Domain Path:       /languages
 *
 * @package Auvyx\Builder
 */

defined( 'ABSPATH' ) || exit;

define( 'AUVYX_BUILDER_VERSION', '1.0.0' );
define( 'AUVYX_BUILDER_FILE', __FILE__ );
define( 'AUVYX_BUILDER_DIR', plugin_dir_path( __FILE__ ) );
define( 'AUVYX_BUILDER_URL', plugin_dir_url( __FILE__ ) );

// a checkout built before a shared file was added lacks it: say so instead of a fatal error on the screen that reads it
$auvyx_builder_built = file_exists( AUVYX_BUILDER_DIR . 'build/editor.asset.php' );
foreach ( array( 'design-system', 'css-properties', 'icons', 'play', 'live', 'code-libraries', 'editions', 'anatomy-markers' ) as $auvyx_builder_data ) {
	$auvyx_builder_built = $auvyx_builder_built && file_exists( AUVYX_BUILDER_DIR . 'generated/' . $auvyx_builder_data . '.php' );
}
if ( ! $auvyx_builder_built ) {
	add_action(
		'admin_notices',
		static function () {
			echo '<div class="notice notice-error"><p>' . esc_html__( 'Auvyx Builder is not built, or was built before this version. Run "bun run build" in the monorepo, or install a release zip.', 'auvyx-builder' ) . '</p></div>';
		}
	);
	return;
}

require_once AUVYX_BUILDER_DIR . 'src/autoload.php';

// Translations come from translate.wordpress.org (WordPress loads them on its own); languages/ holds the template only.

Auvyx\Builder\Plugin::instance()->boot();
