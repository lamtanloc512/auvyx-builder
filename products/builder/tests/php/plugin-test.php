<?php
/**
 * Integration: modules wired into WordPress.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\Blocks\Markup;
use Auvyx\Builder\Plugin;

auvyx_test(
	'blocks are registered from the manifest',
	static function () {
		foreach ( array( 'auvyx/section', 'auvyx/heading', 'auvyx/text', 'auvyx/button' ) as $name ) {
			$type = WP_Block_Type_Registry::get_instance()->get_registered( $name );
			auvyx_assert_same( true, null !== $type, $name );
			auvyx_assert_same( array( 'auvyx-builder-editor' ), $type->editor_script_handles, $name . ' editor script' );
			auvyx_assert_same( array( 'auvyx-builder-blocks' ), $type->style_handles, $name . ' style' );
		}
	}
);

auvyx_test(
	'render adds the content-hash class and collects CSS once per class',
	static function () {
		$styles  = Markup::styles( array( 'gap' => '2rem' ), array(), array( 'gap' => '1rem' ) );
		$content = Markup::section( array( Markup::text( 'A' ) ), $styles ) . Markup::section( array( Markup::text( 'B' ) ), $styles );
		$html    = do_blocks( $content );

		auvyx_assert_same( 2, preg_match_all( '/class="wp-block-auvyx-section (auvyx-[a-z0-9]+)"/', $html, $matches ), 'two styled sections' );
		auvyx_assert_same( $matches[1][0], $matches[1][1], 'identical styles share a class' );

		$css = Plugin::instance()->module( 'styles' )->collected_css();
		auvyx_assert_same( 1, substr_count( $css, '.' . $matches[1][0] . '{gap:2rem}' ), 'rule printed once' );
		auvyx_assert_contains( '@media (max-width:767px){.' . $matches[1][0] . '{gap:1rem}}', $css );
	}
);

auvyx_test(
	'aligned blocks keep their own margins and max-width over core layout CSS',
	static function () {
		$styles = Markup::styles( array( 'max-width' => '720px', 'margin-inline' => 'auto', 'gap' => '1rem' ), array(), array( 'margin-inline' => '0' ) );
		$html   = do_blocks( Markup::section( array(), $styles, array( 'align' => 'full' ) ) );
		auvyx_assert_same( 1, preg_match( '/class="[^"]*\balignfull (auvyx-[a-z0-9]+)"/', $html, $m ), 'styled full section' );

		$css = Plugin::instance()->module( 'styles' )->collected_css();
		auvyx_assert_contains( ':root .' . $m[1] . '.alignfull{max-width:720px;margin-inline:auto}', $css );
		auvyx_assert_contains( '@media (max-width:767px){:root .' . $m[1] . '.alignfull{margin-inline:0}}', $css );
		auvyx_assert_not_contains( '.alignfull{gap', $css, 'only margin and max-width are boosted' );

		$plain = do_blocks( Markup::section( array(), Markup::styles( array( 'gap' => '3rem' ) ), array( 'align' => 'full' ) ) );
		preg_match( '/\b(auvyx-[a-z0-9]+)"/', $plain, $p );
		auvyx_assert_not_contains( ':root .' . $p[1], Plugin::instance()->module( 'styles' )->collected_css(), 'no override without own margins' );
	}
);

auvyx_test(
	'unsafe styles never reach the page',
	static function () {
		$html = do_blocks( Markup::section( array(), array( 'base' => array( 'default' => array( 'color' => 'red}</style><script>alert(1)</script>' ) ) ) ) );
		auvyx_assert_same( 0, preg_match( '/\\bauvyx-[a-z0-9]+\\b/', str_replace( 'wp-block-auvyx-', '', $html ) ), 'no class for fully rejected styles' );
		auvyx_assert_not_contains( '<script>', Plugin::instance()->module( 'styles' )->collected_css() );
	}
);

auvyx_test(
	'blocks without auvyx styles are untouched',
	static function () {
		$html = do_blocks( '<!-- wp:paragraph --><p>Plain</p><!-- /wp:paragraph -->' );
		auvyx_assert_same( 0, preg_match( '/\\bauvyx-/', $html ), $html );
	}
);

auvyx_test(
	'design tokens are injected into theme.json presets',
	static function () {
		$palette = array_column( (array) wp_get_global_settings( array( 'color', 'palette', 'theme' ) ), 'slug' );
		auvyx_assert_same( true, in_array( 'auvyx-primary', $palette, true ), 'palette has Auvyx tokens' );
		auvyx_assert_same( true, count( $palette ) > 6, 'theme palette is kept: ' . implode( ',', $palette ) );
		$sizes = wp_get_global_settings( array( 'typography', 'fontSizes', 'theme' ) );
		auvyx_assert_same( true, in_array( 'auvyx-xxl', array_column( (array) $sizes, 'slug' ), true ), 'font sizes' );
		auvyx_assert_contains( '--wp--preset--color--auvyx-primary: var(--wp--preset--color--', wp_get_global_stylesheet( array( 'variables' ) ), 'colors nobody chose follow the theme' );
		auvyx_assert_same(
			array( 'var(--wp--preset--color--accent)', '#123456' ),
			array_column(
				Auvyx\Builder\Modules\DesignSystem\DesignSystem::follow_theme(
					array(
						array( 'slug' => 'auvyx-primary', 'name' => 'P', 'color' => '#2563eb' ),
						array( 'slug' => 'auvyx-other', 'name' => 'O', 'color' => '#123456' ),
					),
					array( 'theme' => array( array( 'slug' => 'accent' ), array( 'slug' => 'contrast' ) ) )
				),
				'color'
			),
			'a role found in the theme wins; unknown Auvyx colors keep their value'
		);
	}
);

auvyx_test(
	'landing pattern is registered and every block renders',
	static function () {
		$pattern = WP_Block_Patterns_Registry::get_instance()->get_registered( 'auvyx-builder/landing' );
		auvyx_assert_same( true, is_array( $pattern ), 'registered' );
		$html = do_blocks( $pattern['content'] );
		auvyx_assert_contains( '<h1 class="wp-block-auvyx-heading auvyx-', $html );
		auvyx_assert_contains( 'class="wp-block-auvyx-button auvyx-', $html );
		auvyx_assert_contains( '<article class="wp-block-auvyx-section auvyx-', $html );
	}
);

auvyx_test(
	'late rules are printed in the footer for content rendered after wp_head',
	static function () {
		do_blocks( Markup::text( 'late', Markup::styles( array( 'letter-spacing' => '0.3em' ) ) ) );
		ob_start();
		Plugin::instance()->module( 'styles' )->print_late_rules();
		$output = (string) ob_get_clean();
		auvyx_assert_contains( '<style id="auvyx-builder-styles-late">', $output );
		auvyx_assert_contains( '{letter-spacing:0.3em}', $output );
	}
);

auvyx_test(
	'pattern markup snapshot (validated against JS save() by blocks.test.ts)',
	static function () {
		$file    = AUVYX_BUILDER_DIR . 'tests/fixtures/landing.html';
		$content = WP_Block_Patterns_Registry::get_instance()->get_registered( 'auvyx-builder/landing' )['content'];
		if ( defined( 'AUVYX_UPDATE_SNAPSHOTS' ) || ! file_exists( $file ) ) {
			file_put_contents( $file, $content ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		}
		auvyx_assert_same( (string) file_get_contents( $file ), $content, 'run `bun run test:php --update` after intentional changes' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
	}
);

auvyx_test(
	'an element\'s own CSS is scoped to it and collected with the other rules',
	static function () {
		$content = '<!-- wp:auvyx/section {"auvyx":{"v":1,"css":"opacity: .9;\\n\\u0026:hover { transform: translateY(-2px) }"}} --><section class="wp-block-auvyx-section"></section><!-- /wp:auvyx/section -->';
		$html    = do_blocks( $content );
		auvyx_assert_same( 1, preg_match( '/class="wp-block-auvyx-section (auvyx-x[a-z0-9]+)"/', $html, $m ), $html );
		auvyx_assert_contains( '.' . $m[1] . '{opacity: .9;&:hover { transform: translateY(-2px) }}', Plugin::instance()->module( 'styles' )->collected_css() );
		$bad = do_blocks( '<!-- wp:auvyx/section {"auvyx":{"v":1,"css":"} body { display: none } .x {"}} --><section class="wp-block-auvyx-section"></section><!-- /wp:auvyx/section -->' );
		auvyx_assert_same( 0, preg_match( '/auvyx-x/', $bad ), 'CSS that escapes its element is not used' );
	}
);

auvyx_test(
	'only users who may write unrestricted HTML keep an element\'s own CSS',
	static function () {
		$content = '<!-- wp:auvyx/section {"auvyx":{"v":1,"css":"color: red;","label":"Hero"}} --><section class="wp-block-auvyx-section"></section><!-- /wp:auvyx/section -->';
		$author  = wp_insert_user( array( 'user_login' => 'css-author', 'user_pass' => wp_generate_password(), 'role' => 'author' ) );
		wp_set_current_user( $author );
		$id = wp_insert_post( array( 'post_title' => 'CSS guard', 'post_content' => wp_slash( $content ), 'post_status' => 'draft' ) );
		$saved = get_post( $id )->post_content;
		auvyx_assert_not_contains( '"css"', $saved, 'an author loses it' );
		auvyx_assert_contains( '"label":"Hero"', $saved, 'the rest of the attribute stays' );
		wp_set_current_user( 1 );
		$admin_saved = get_post( wp_insert_post( array( 'post_title' => 'CSS kept', 'post_content' => wp_slash( $content ), 'post_status' => 'draft' ) ) )->post_content;
		if ( current_user_can( 'unfiltered_html' ) ) {
			auvyx_assert_contains( '"css":"color: red;"', $admin_saved, 'an administrator keeps it' );
		}
	}
);

auvyx_test(
	'a brand set in Auvyx colors recolors the Auvyx theme\'s own roles; other themes keep theirs',
	static function () {
		$palette = array(
			array( 'slug' => 'accent', 'name' => 'Accent', 'color' => '#171717' ),
			array( 'slug' => 'base', 'name' => 'Base', 'color' => '#ffffff' ),
			array( 'slug' => 'custom', 'name' => 'Custom', 'color' => '#123456' ),
		);
		$colors  = array(
			array( 'slug' => 'auvyx-primary', 'name' => 'P', 'color' => '#0f766e' ),
			array( 'slug' => 'auvyx-base', 'name' => 'B', 'color' => 'var(--wp--preset--color--base)' ),
		);
		$out     = \Auvyx\Builder\Modules\DesignSystem\DesignSystem::brand_theme( $palette, $colors );
		auvyx_assert_same( '#0f766e', $out[0]['color'], 'the accent takes the primary' );
		auvyx_assert_same( '#ffffff', $out[1]['color'], 'a token that follows the theme does not loop back' );
		auvyx_assert_same( '#123456', $out[2]['color'], 'a color without a role stays' );
	}
);

auvyx_test(
	'a brand that names some Auvyx colors keeps the others: no token goes missing',
	static function () {
		update_option( \Auvyx\Builder\Modules\DesignSystem\DesignSystem::OPTION, array( 'tokens' => array( 'color' => array( array( 'slug' => 'auvyx-primary', 'name' => 'P', 'color' => '#0f766e' ) ) ) ) );
		$tokens = Plugin::instance()->module( 'design-system' )->get()['tokens']['color'];
		$slugs  = array_column( $tokens, 'slug' );
		auvyx_assert_same( true, in_array( 'auvyx-secondary', $slugs, true ) && in_array( 'auvyx-text', $slugs, true ), implode( ',', $slugs ) );
		auvyx_assert_same( '#0f766e', array_column( $tokens, 'color', 'slug' )['auvyx-primary'] );
		delete_option( \Auvyx\Builder\Modules\DesignSystem\DesignSystem::OPTION );
	}
);

auvyx_test(
	'a code element renders its HTML and module inside its section, loads code.js, and only scripting users keep it',
	static function () {
		$content = '<!-- wp:auvyx/section {"tagName":"div","auvyx":{"v":1,"code":{"markup":"\u003cdiv class=\u0022orb\u0022\u003e\u003c/div\u003e","script":"export default ({ el }) => { el.title = \u0022\u003c/script\u003e\u0022; };","libs":["motion","evil"],"uses":[]}}} --><div class="wp-block-auvyx-section"></div><!-- /wp:auvyx/section -->';
		$html    = do_blocks( $content );
		auvyx_assert_contains( 'data-auvyx-code', $html );
		auvyx_assert_contains( 'data-auvyx-libs="motion"', $html );
		auvyx_assert_contains( '<div class="orb"></div><script type="application/json" data-auvyx-js-json>', $html );
		auvyx_assert_same( 1, substr_count( $html, '</script>' ), 'the module cannot close its own tag' );
		auvyx_assert_same( 'export default ({ el }) => { el.title = "</script>"; };', json_decode( (string) preg_replace( '#^.*data-auvyx-js-json>(.*?)</script>.*$#s', '$1', $html ) ), 'the module comes back exactly' );
		auvyx_assert_same( true, wp_script_is( 'auvyx-code', 'enqueued' ) );
		$author = wp_insert_user( array( 'user_login' => 'code-author', 'user_pass' => wp_generate_password(), 'role' => 'author' ) );
		wp_set_current_user( $author );
		$saved = get_post( wp_insert_post( array( 'post_title' => 'Code guard', 'post_content' => wp_slash( $content ), 'post_status' => 'draft' ) ) )->post_content;
		auvyx_assert_not_contains( '"code"', $saved, 'an author loses the code' );
		wp_set_current_user( 1 );
	}
);

auvyx_test(
	'smooth corners: the same rule as Corners.scala (shared fixture), and the class on rounded elements only',
	static function () {
		$cases = json_decode( (string) file_get_contents( AUVYX_SHARED_DIR . '/fixtures/corners/cases.json' ), true );
		foreach ( $cases['cases'] as $case ) {
			auvyx_assert_same( $case['smooth'], \Auvyx\Builder\Modules\Styles\Styles::smooth_corner( $case['value'] ), $case['value'] );
		}
		$card = do_blocks( Markup::section( array(), Markup::styles( array( 'border-radius' => 'var(--wp--custom--radius--lg)' ) ) ) );
		auvyx_assert_contains( 'auvyx-squircle', $card );
		$pill = do_blocks( Markup::section( array(), Markup::styles( array( 'border-radius' => 'var(--wp--custom--radius--full)' ) ) ) );
		auvyx_assert_not_contains( 'auvyx-squircle', $pill );
		// A button is rounded by default: smooth without styles of its own, a pill when it asks for one.
		auvyx_assert_contains( 'auvyx-squircle', do_blocks( Markup::button( 'Go', '/go' ) ) );
		auvyx_assert_not_contains( 'auvyx-squircle', do_blocks( Markup::button( 'Go', '/go', Markup::styles( array( 'border-radius' => 'var(--wp--custom--radius--full)' ) ) ) ) );
		auvyx_assert_not_contains( 'auvyx-squircle', do_blocks( Markup::text( 'Plain' ) ) );
		auvyx_assert_contains( 'corner-shape: squircle', (string) file_get_contents( AUVYX_BUILDER_DIR . 'assets/blocks.css' ) );
	}
);

auvyx_test(
	'video autoplay: starts muted with the players\' APIs on, gets video.js and its sound button; files play as players',
	static function () {
		$auto = do_blocks( '<!-- wp:auvyx/video {"url":"https://www.youtube.com/watch?v=aqz-KE-bpKQ","className":"auvyx-video-autoplay"} /-->' );
		auvyx_assert_contains( 'data-auvyx-autoplay="1"', $auto );
		auvyx_assert_contains( 'youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1&#038;mute=1&#038;playsinline=1&#038;rel=0&#038;enablejsapi=1', $auto );
		auvyx_assert_contains( 'allow="autoplay; encrypted-media; picture-in-picture"', $auto );
		auvyx_assert_same( true, wp_script_is( 'auvyx-video-autoplay', 'enqueued' ), 'video.js on the page' );

		$vimeo = do_blocks( '<!-- wp:auvyx/video {"url":"https://vimeo.com/76979871","className":"auvyx-video-autoplay"} /-->' );
		auvyx_assert_contains( 'player.vimeo.com/video/76979871?autoplay=1&#038;muted=1&#038;playsinline=1', $vimeo );

		$file = do_blocks( '<!-- wp:auvyx/video {"url":"https://example.com/a.mp4","className":"auvyx-video-autoplay"} /-->' );
		auvyx_assert_contains( '<video src="https://example.com/a.mp4" autoplay muted playsinline controls preload="metadata"></video>', $file );

		$player = do_blocks( '<!-- wp:auvyx/video {"url":"https://example.com/a.mp4"} /-->' );
		auvyx_assert_contains( '<video src="https://example.com/a.mp4" controls playsinline preload="metadata"></video>', $player );
		auvyx_assert_not_contains( 'data-auvyx-autoplay', $player );

		$plain = do_blocks( '<!-- wp:auvyx/video {"url":"https://www.youtube.com/watch?v=aqz-KE-bpKQ"} /-->' );
		auvyx_assert_not_contains( 'autoplay=1', $plain );
	}
);

auvyx_test(
	'a theme that draws its own colours turns Auvyx\'s section colours off (auvyx-own-colors on the body)',
	static function () {
		auvyx_assert_same( false, in_array( 'auvyx-own-colors', Auvyx\Builder\Modules\Blocks\Blocks::own_colors( array( 'home' ) ), true ), 'off by default' );
		add_theme_support( Auvyx\Builder\Modules\Blocks\Blocks::OWN_COLORS );
		auvyx_assert_same( array( 'home', 'auvyx-own-colors' ), Auvyx\Builder\Modules\Blocks\Blocks::own_colors( array( 'home' ) ) );
		remove_theme_support( Auvyx\Builder\Modules\Blocks\Blocks::OWN_COLORS );
		$css = (string) file_get_contents( AUVYX_BUILDER_DIR . 'assets/blocks.css' );
		auvyx_assert_contains( ':where(body:not(.auvyx-own-colors)) :where(.wp-block-auvyx-section):not(.has-text-color)', $css );
		auvyx_assert_contains( 'body:where(:not(.auvyx-own-colors)) .wp-block-auvyx-section :is(h1, h2, h3, h4, h5, h6, p, li, summary)', $css );
	}
);

auvyx_test(
	'a code element module survives the_content: wptexturize cannot read `a < b && c > d` as a tag and rewrite its &',
	static function () {
		$script  = 'export default ({ el }) => { const ok = (a, b) => a < b && b > 0 && "x" !== \'y\'; el.dataset.ok = ok(1, 2); };';
		$content = '<!-- wp:auvyx/section {"tagName":"div","auvyx":{"v":1,"code":{"markup":"","script":' . wp_json_encode( $script ) . ',"libs":[],"uses":[]}}} --><div class="wp-block-auvyx-section"></div><!-- /wp:auvyx/section -->';
		$html    = apply_filters( 'the_content', $content );
		$json    = (string) preg_replace( '#^.*data-auvyx-js-json>(.*?)</script>.*$#s', '$1', $html );
		auvyx_assert_not_contains( '&', $json, 'no ampersand left for a filter to rewrite' );
		auvyx_assert_not_contains( '<', $json );
		auvyx_assert_same( $script, json_decode( $json ), 'the module comes back byte for byte' );
	}
);
