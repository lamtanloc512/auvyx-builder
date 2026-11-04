<?php
/**
 * Token mapping, classic-theme fallback, WordPress utility classes, and the shadow export.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\DesignSystem\DesignSystem;
use Auvyx\Builder\Modules\ThemeAdapter\ThemeTokens;

auvyx_test(
	'theme palettes map onto Auvyx tokens, including Twenty Twenty-Five, Astra and Kadence slugs',
	static function () {
		$colors = array(
			array( 'slug' => 'auvyx-primary', 'name' => 'P', 'color' => '#2563eb' ),
			array( 'slug' => 'auvyx-text', 'name' => 'T', 'color' => '#111111' ),
			array( 'slug' => 'auvyx-base', 'name' => 'B', 'color' => '#ffffff' ),
		);
		$tt5 = DesignSystem::follow_theme(
			$colors,
			array(
				array( 'slug' => 'base' ),
				array( 'slug' => 'contrast' ),
				array( 'slug' => 'accent-1' ),
			)
		);
		auvyx_assert_same(
			array( 'var(--wp--preset--color--accent-1)', 'var(--wp--preset--color--contrast)', 'var(--wp--preset--color--base)' ),
			array_column( $tt5, 'color' ),
			'Twenty Twenty-Five'
		);
		$astra = DesignSystem::follow_theme(
			$colors,
			array(
				array( 'slug' => 'ast-global-color-0' ),
				array( 'slug' => 'ast-global-color-3' ),
				array( 'slug' => 'ast-global-color-4' ),
			)
		);
		auvyx_assert_same(
			array( 'var(--wp--preset--color--ast-global-color-0)', 'var(--wp--preset--color--ast-global-color-3)', 'var(--wp--preset--color--ast-global-color-4)' ),
			array_column( $astra, 'color' ),
			'Astra'
		);
		$kadence = DesignSystem::follow_theme(
			$colors,
			array(
				array( 'slug' => 'theme-palette1' ),
				array( 'slug' => 'theme-palette3' ),
				array( 'slug' => 'theme-palette9' ),
			)
		);
		auvyx_assert_same(
			array( 'var(--wp--preset--color--theme-palette1)', 'var(--wp--preset--color--theme-palette3)', 'var(--wp--preset--color--theme-palette9)' ),
			array_column( $kadence, 'color' ),
			'Kadence'
		);
		$sizes = DesignSystem::follow_theme(
			array(
				array( 'slug' => 'auvyx-xl', 'name' => 'XL', 'size' => '1rem' ),
				array( 'slug' => 'auvyx-xxl', 'name' => 'XXL', 'size' => '2rem' ),
			),
			array( array( 'slug' => 'larger' ), array( 'slug' => 'xxlarge' ) ),
			DesignSystem::SIZE_ROLES,
			'size',
			'font-size'
		);
		auvyx_assert_same(
			array( 'var(--wp--preset--font-size--larger)', 'var(--wp--preset--font-size--xxlarge)' ),
			array_column( $sizes, 'size' ),
			'Kadence type scale'
		);
		$fonts = DesignSystem::follow_theme(
			array( array( 'slug' => 'auvyx-body', 'name' => 'Body', 'size' => 'Geist, sans-serif' ) ),
			array( array( 'slug' => 'manrope' ) ),
			DesignSystem::FONT_ROLES,
			'size',
			'font-family'
		);
		auvyx_assert_same( 'var(--wp--preset--font-family--manrope)', $fonts[0]['size'], 'Twenty Twenty-Five body font' );
	}
);

auvyx_test(
	'preset values become has-* classes and a classic stylesheet supplies color and font',
	static function () {
		auvyx_assert_same(
			array( 'has-text-color', 'has-auvyx-primary-color', 'has-background', 'has-accent-1-background-color', 'has-large-font-size', 'has-manrope-font-family' ),
			ThemeTokens::utility_classes(
				array(
					'color'            => 'var(--wp--preset--color--auvyx-primary)',
					'background-color' => 'var(--wp--preset--color--accent-1)',
					'font-size'        => 'var(--wp--preset--font-size--large)',
					'font-family'      => 'var(--wp--preset--font-family--manrope)',
					'padding'          => '8px',
				)
			)
		);
		auvyx_assert_same( array( 'has-text-color' ), ThemeTokens::utility_classes( array( 'color' => '#ff00aa', 'font-size' => '20px' ) ) );
		auvyx_assert_same( array( 'has-background' ), ThemeTokens::utility_classes( array( 'background-color' => 'rgb(1, 2, 3)' ) ) );
		auvyx_assert_same( array(), ThemeTokens::utility_classes( array( 'font-size' => '20px' ) ) );
		$classic = '/* theme */ body { color: #222222; background-color: #fafafa; font-family: Lato, sans-serif; } h1 { color: red !important; }';
		auvyx_assert_same(
			array( 'color' => '#222222', 'background' => '#fafafa', 'fontFamily' => 'Lato, sans-serif' ),
			ThemeTokens::from_css( $classic )
		);
		auvyx_assert_same( '', ThemeTokens::from_css( 'body { color: url(https://evil.test); font-family: "</style>"; }' )['color'] );
		auvyx_assert_same( '', ThemeTokens::from_css( 'body { font-family: "</style>"; }' )['fontFamily'] );
		$reset = ThemeTokens::isolated_css();
		auvyx_assert_contains( '@layer auvyx-reset, auvyx-blocks', $reset );
		auvyx_assert_contains( '.auvyx-isolated.auvyx-isolated', $reset );
		$boost = ThemeTokens::boost_isolated( '.auvyx-hero{font-size:64px;font-weight:600}@media (min-width:782px){.auvyx-hero{font-size:40px}}:root .auvyx-hero.alignfull{max-width:40rem}@keyframes auvyx{from{opacity:0}to{opacity:1}}' );
		$classic = ThemeTokens::boost_under( '.auvyx-hero{margin-block-start:0}@media (max-width:767px){.auvyx-hero{font-size:36px}}', 'body :is(.entry-content,.wp-block-post-content)' );
		auvyx_assert_contains( 'body :is(.entry-content,.wp-block-post-content) .auvyx-hero{margin-block-start:0}', $classic );
		auvyx_assert_contains( '@media (max-width:767px){body :is(.entry-content,.wp-block-post-content) .auvyx-hero{font-size:36px}}', $classic );
		auvyx_assert_same( '', ThemeTokens::boost_under( '.auvyx-hero{font-size:1px}', 'body;}' ), 'a prefix cannot break out of the selector' );
		auvyx_assert_contains( '.auvyx-isolated.auvyx-isolated .auvyx-hero{font-size:64px;font-weight:600}', $boost );
		auvyx_assert_contains( '@media (min-width:782px){.auvyx-isolated.auvyx-isolated .auvyx-hero{font-size:40px}}', $boost );
		auvyx_assert_contains( '.auvyx-isolated.auvyx-isolated .auvyx-hero.alignfull{max-width:40rem}', $boost );
		auvyx_assert_contains( '@keyframes auvyx{from{opacity:0}to{opacity:1}}', $boost );
		auvyx_assert_not_contains( ':root', $boost );
	}
);

auvyx_test(
	'a shadow section renders as a declarative shadow root and a follow section gains utility classes',
	static function () {
		$follow = '<!-- wp:auvyx/section {"auvyx":{"v":1,"styles":{"base":{"default":{"color":"var(--wp--preset--color--auvyx-primary)"}}}}} -->' . "\n"
			. '<section class="wp-block-auvyx-section"><h1>Hello</h1></section>' . "\n"
			. '<!-- /wp:auvyx/section -->';
		$shown = do_blocks( $follow );
		auvyx_assert_contains( 'has-text-color', $shown );
		auvyx_assert_contains( 'has-auvyx-primary-color', $shown );
		auvyx_assert_not_contains( 'shadowrootmode', $shown );
		$shadow = '<!-- wp:auvyx/section {"className":"auvyx-shadow","auvyx":{"v":1,"styles":{"base":{"default":{"color":"var(--wp--preset--color--auvyx-text)"}}}}} -->' . "\n"
			. '<section class="wp-block-auvyx-section auvyx-shadow">' . "\n"
			. '<!-- wp:auvyx/heading {"auvyx":{"v":1,"styles":{"base":{"default":{"padding":"12px"}}}}} -->' . "\n"
			. '<h1 class="wp-block-auvyx-heading">Hello</h1>' . "\n"
			. '<!-- /wp:auvyx/heading -->' . "\n"
			. '</section>' . "\n"
			. '<!-- /wp:auvyx/section -->';
		$wrapped = do_blocks( $shadow );
		auvyx_assert_contains( '<auvyx-section data-auvyx-mode="shadow">', $wrapped );
		auvyx_assert_contains( 'shadowrootmode="open"', $wrapped );
		auvyx_assert_contains( ':host{display:block;', $wrapped );
		auvyx_assert_contains( '@layer auvyx-blocks{', $wrapped );
		auvyx_assert_contains( 'color:var(--wp--preset--color--auvyx-text)', $wrapped );
		auvyx_assert_contains( 'padding:12px', $wrapped );
		auvyx_assert_not_contains( '<script', $wrapped );
		auvyx_assert_contains( '>Hello<', $wrapped );
		if ( 1 !== preg_match( '/\.(auvyx-[a-z0-9]+)\{[^}]*padding:12px/', $wrapped, $pad ) ) {
			throw new RuntimeException( 'padding rule missing from the shadow style' );
		}
		if ( 1 !== preg_match( '/<h1[^>]*class="[^"]*' . preg_quote( $pad[1], '/' ) . '/', $wrapped ) ) {
			throw new RuntimeException( 'the heading style class is missing from the shadow tree' );
		}
		$isolated = '<!-- wp:auvyx/section {"className":"auvyx-isolated"} -->' . "\n"
			. '<section class="wp-block-auvyx-section auvyx-isolated">' . "\n"
			. '<!-- wp:auvyx/heading {"auvyx":{"v":1,"styles":{"base":{"default":{"font-size":"64px","font-weight":"600"}}}}} -->' . "\n"
			. '<h1 class="wp-block-auvyx-heading">Ship the query.</h1>' . "\n"
			. '<!-- /wp:auvyx/heading -->' . "\n"
			. '</section>' . "\n"
			. '<!-- /wp:auvyx/section -->';
		$rendered = do_blocks( $isolated );
		$sheet    = \Auvyx\Builder\Plugin::instance()->module( 'styles' )->front_css();
		if ( 1 !== preg_match( '/\.auvyx-isolated\.auvyx-isolated \.(auvyx-[a-z0-9]+)\{font-size:64px;font-weight:600\}/', $sheet, $hero ) ) {
			throw new RuntimeException( 'isolated boost missing the heading rule: ' . $sheet );
		}
		auvyx_assert_contains( '.' . $hero[1] . '{font-size:64px;font-weight:600}', $sheet );
		// In a header or footer too, as strong as blocks.css's button rule (which prints before): a button's own background wins.
		auvyx_assert_contains( 'html body :is(.entry-content,.wp-block-post-content,.wp-block-template-part,.auvyx-location,.wp-block-auvyx-section) .' . $hero[1] . '{font-size:64px;font-weight:600}', $sheet );
		if ( 1 !== preg_match( '/<h1[^>]*class="[^"]*' . preg_quote( $hero[1], '/' ) . '/', $rendered ) ) {
			throw new RuntimeException( 'heading is missing its style class' );
		}
		$nav = ThemeTokens::shadow_html( '<nav class="wp-block-auvyx-nav"><button type="button">Menu</button></nav>', '', '--wp--preset--color--auvyx-text:#111', true, 'shadow' );
		auvyx_assert_contains( 'getRootNode', $nav );
		auvyx_assert_not_contains( '</script><script', $nav );
	}
);
