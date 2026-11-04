<?php
/**
 * Prints the isolation CSS the browser test measures. Not a WordPress test.
 *
 * @package Auvyx\Builder
 */

define( 'ABSPATH', __DIR__ );
require dirname( __DIR__, 2 ) . '/src/Modules/ThemeAdapter/ThemeTokens.php';

use Auvyx\Builder\Modules\ThemeAdapter\ThemeTokens;

$block  = '.auvyx-hero{font-size:64px;font-weight:600}';
$tokens = '--wp--preset--color--auvyx-text:#111111;--wp--preset--font-family--auvyx-body:Manrope, sans-serif;--wp--preset--font-size--auvyx-md:1.05rem';
$inner  = '<h1 class="auvyx-hero">Ship the query.</h1><p>Body copy.</p>';

echo json_encode(
	array(
		'reset'  => ThemeTokens::isolated_css(),
		'block'  => $block,
		'boost'  => ThemeTokens::boost_isolated( $block ),
		'shadow' => ThemeTokens::shadow_html( $inner, $block, $tokens, false, 'shadow' ),
	)
);
