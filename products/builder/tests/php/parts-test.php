<?php
/**
 * Header & footer (template parts) in Auvyx Studio, and the Auvyx Navigation block.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\Data\Menus;
use Auvyx\Builder\Modules\Studio\Parts;
use Auvyx\Builder\Plugin;

auvyx_test(
	'nav: renders the pages as a bar and a <details> menu, escaped, with the toggle class',
	static function () {
		wp_insert_post(
			array(
				'post_type'   => 'page',
				'post_status' => 'publish',
				'post_title'  => 'About & co',
				'menu_order'  => -1,
			)
		);
		$html = do_blocks( '<!-- wp:auvyx/nav {"toggleAt":"tablet"} /-->' );
		auvyx_assert_contains( 'auvyx-nav--toggle-tablet', $html );
		auvyx_assert_contains( '<details class="auvyx-nav__menu">', $html );
		auvyx_assert_contains( '>About &#038; co</a>', $html );
		auvyx_assert_same( 2, substr_count( $html, 'About &#038; co' ), 'bar + menu panel' );
		auvyx_assert_not_contains( '<script', $html );
	}
);

auvyx_test(
	'nav: a wp_navigation source gives its top-level links; unknown sources fall back to pages',
	static function () {
		$nav = wp_insert_post(
			array(
				'post_type'    => 'wp_navigation',
				'post_status'  => 'publish',
				'post_title'   => 'Main',
				'post_content' => '<!-- wp:navigation-link {"label":"Docs","url":"https://example.com/docs"} /--><!-- wp:navigation-submenu {"label":"More","url":"#more"} --><!-- wp:navigation-link {"label":"Deep","url":"#deep"} /--><!-- /wp:navigation-submenu -->',
			)
		);
		$items = Menus::items( 'nav:' . $nav );
		auvyx_assert_same( array( 'Docs', 'More' ), wp_list_pluck( $items, 'label' ) );
		auvyx_assert_same( wp_list_pluck( Menus::items( 'pages' ), 'label' ), wp_list_pluck( Menus::items( 'nope' ), 'label' ) );
		auvyx_assert_same( true, in_array( 'nav:' . $nav, wp_list_pluck( Menus::sources(), 'id' ), true ) );
	}
);

auvyx_test(
	'parts: opening a theme part creates its database copy once; Studio saves it through template-parts',
	static function () {
		if ( ! Parts::supported() ) {
			return; // classic theme in this environment
		}
		$parts = Parts::all();
		auvyx_assert_same( true, count( $parts ) > 0 );
		$id    = $parts[0]->id;
		$first = Parts::ensure_post( $id );
		auvyx_assert_same( true, $first > 0 );
		auvyx_assert_same( $first, Parts::ensure_post( $id ), 'same post the second time' );
		$post = get_post( $first );
		auvyx_assert_same( 'wp_template_part', $post->post_type );
		auvyx_assert_same( $id, Parts::template_id( $post ) );
		$config = Plugin::instance()->module( 'studio' )->config( $post );
		auvyx_assert_same( 'template-parts', $config['restBase'] );
		auvyx_assert_same( $id, $config['restId'] );
		auvyx_assert_contains( Parts::PARAM . '=', $config['canvasUrl'] );
		auvyx_assert_same( 0, Parts::ensure_post( get_stylesheet() . '//does-not-exist' ) );
	}
);

auvyx_test(
	'parts: in canvas mode the edited part becomes the Studio root inside its wrapper',
	static function () {
		Parts::replace_in_canvas( 'auvyx-test-part', '<!--root-->' );
		$html = render_block(
			array(
				'blockName'    => 'core/template-part',
				'attrs'        => array(
					'slug'    => 'auvyx-test-part',
					'tagName' => 'header',
				),
				'innerBlocks'  => array(),
				'innerHTML'    => '',
				'innerContent' => array(),
			)
		);
		auvyx_assert_same( '<header class="wp-block-template-part"><!--root--></header>', $html );
	}
);

auvyx_test(
	'nav: submenus from child pages; menu-button breakpoints follow the design system',
	static function () {
		$parent = wp_insert_post(
			array(
				'post_type'   => 'page',
				'post_status' => 'publish',
				'post_title'  => 'Services',
			)
		);
		wp_insert_post(
			array(
				'post_type'   => 'page',
				'post_status' => 'publish',
				'post_title'  => 'Design audits',
				'post_parent' => $parent,
			)
		);
		$html = do_blocks( '<!-- wp:auvyx/nav /-->' );
		auvyx_assert_contains( '<li class="auvyx-nav__parent"><a href="' . esc_url( get_permalink( $parent ) ) . '">Services</a><ul class="auvyx-nav__sub"><li><a href="', $html );
		auvyx_assert_contains( '>Design audits</a>', $html );
		$css = Auvyx\Builder\Modules\Blocks\Blocks::nav_breakpoints(
			array(
				array( 'id' => 'base' ),
				array(
					'id'       => 'tablet',
					'maxWidth' => 960,
				),
				array(
					'id'       => 'mobile',
					'maxWidth' => 600,
				),
			)
		);
		auvyx_assert_contains( '@media (max-width:960px){.auvyx-nav--toggle-tablet', $css );
		auvyx_assert_contains( '@media (max-width:600px){.auvyx-nav--toggle-mobile', $css );
	}
);

auvyx_test(
	'parts: a part used only on product pages opens on a product; one used everywhere stays on the site (ADR 0036)',
	static function () {
		$parts = Auvyx\Builder\Modules\Studio\Parts::class;
		auvyx_assert_same( 'product', $parts::context_for( array( 'single-product' ), true ) );
		auvyx_assert_same( 'product', $parts::context_for( array( 'single-product', 'single-product-layout-grid', 'single-product-layout-wide' ), true ), 'product page layout presets' );
		auvyx_assert_same( 'catalog', $parts::context_for( array( 'archive-product', 'taxonomy-product_cat', 'taxonomy-product_tag' ), true ) );
		auvyx_assert_same( 'site', $parts::context_for( array( 'index', 'single-product', 'archive-product' ), true ), 'the header' );
		auvyx_assert_same( 'site', $parts::context_for( array( 'single-product' ), false ), 'no WooCommerce' );
		auvyx_assert_same( 'post', $parts::context_for( array( 'single' ), false ) );
		auvyx_assert_same( 'site', $parts::context_for( array(), true ), 'unused parts' );
		// A custom type's item pages (single-{type}) are previewed with one of its items.
		register_post_type( 'auvyx_test_item', array( 'public' => true ) );
		auvyx_assert_same( 'auvyx_test_item', $parts::item_type( array( 'single-auvyx_test_item' ) ) );
		auvyx_assert_same( 'post', $parts::item_type( array( 'single' ) ) );
		auvyx_assert_same( '', $parts::item_type( array( 'single', 'single-auvyx_test_item' ) ), 'two types' );
		auvyx_assert_same( '', $parts::item_type( array( 'single-product' ) ), 'products are their own context' );
		auvyx_assert_same( '', $parts::item_type( array( 'single-nope' ) ), 'an unknown type' );
		unregister_post_type( 'auvyx_test_item' );
		// A post part is previewed with the post asked for, else the latest; the canvas is that post.
		$part   = get_post(
			wp_insert_post(
				array(
					'post_type'   => 'wp_template_part',
					'post_status' => 'publish',
					'post_name'   => 'auvyx-test-unused',
					'post_title'  => 'Unused',
				)
			)
		);
		auvyx_assert_same( 0, $parts::preview_id( $part ), 'site parts have no preview item' );
		auvyx_assert_same( null, $parts::preview( $part ) );
		auvyx_assert_contains( 'auvyx-part=auvyx-test-unused', $parts::canvas_url( $part ) );
		auvyx_assert_same( 'ran', $parts::with_preview( $part, static fn() => 'ran' ) );
	}
);

auvyx_test(
	'parts: a part only a page-pinned template shows gets that page as its canvas',
	static function () {
		if ( ! Parts::supported() ) {
			return;
		}
		if ( ! in_array( 'page-checkout', Parts::templates_using( 'checkout-header' ), true ) ) {
			return; // the theme in this environment pins no part to a single page
		}
		$page = wp_insert_post(
			array(
				'post_type'   => 'page',
				'post_status' => 'publish',
				'post_title'  => 'Checkout',
				'post_name'   => 'checkout',
			)
		);
		$part = get_post(
			wp_insert_post(
				array(
					'post_type'   => 'wp_template_part',
					'post_status' => 'publish',
					'post_name'   => 'checkout-header',
					'post_title'  => 'Checkout header',
				)
			)
		);
		$url  = Parts::canvas_url( $part );
		auvyx_assert_contains( 'auvyx-part=checkout-header', $url );
		auvyx_assert_same( 0, strpos( $url, (string) get_permalink( $page ) ), 'the canvas is the page the pinned template reaches' );
	}
);

auvyx_test(
	'button: theme button text beats the theme link colour rule but not a button class',
	static function () {
		$css  = Auvyx\Builder\Modules\Blocks\Blocks::theme_button_css();
		$text = wp_get_global_styles( array( 'elements', 'button', 'color', 'text' ) );
		if ( is_string( $text ) && '' !== $text ) {
			auvyx_assert_contains( 'body a:where(.wp-block-auvyx-button){color:', $css );
		}
		auvyx_assert_contains( 'body a:where(.wp-block-auvyx-button)', (string) file_get_contents( AUVYX_BUILDER_DIR . 'assets/blocks.css' ) );
	}
);

auvyx_test(
	'slider: a horizontal scroll-snap section gets auvyx-slider and loads the slider script; other sections do not',
	static function () {
		$track = '<!-- wp:auvyx/section {"tagName":"div","auvyx":{"v":1,"styles":{"base":{"default":{"display":"flex","overflow-x":"auto","scroll-snap-type":"x mandatory"}}}}} --><div class="wp-block-auvyx-section"><!-- wp:auvyx/text --><p class="wp-block-auvyx-text">A</p><!-- /wp:auvyx/text --></div><!-- /wp:auvyx/section -->';
		$plain = '<!-- wp:auvyx/section {"tagName":"div","auvyx":{"v":1,"styles":{"base":{"default":{"display":"flex"}}}}} --><div class="wp-block-auvyx-section"></div><!-- /wp:auvyx/section -->';
		wp_dequeue_script( 'auvyx-slider' );
		auvyx_assert_not_contains( 'auvyx-slider', do_blocks( $plain ), 'plain section stays plain' );
		auvyx_assert_same( false, wp_script_is( 'auvyx-slider', 'enqueued' ), 'no script without a slider' );
		auvyx_assert_contains( 'auvyx-slider', do_blocks( $track ) );
		auvyx_assert_same( 0, strpos( trim( do_blocks( $track ) ), '<div class="auvyx-slider-wrap' ), 'the arrows wrapper comes with the page' );
		auvyx_assert_same( true, wp_script_is( 'auvyx-slider', 'enqueued' ), 'script enqueued for a slider' );
	}
);

auvyx_test(
	'tabs: a auvyx-tabs section loads the tabs script',
	static function () {
		wp_dequeue_script( 'auvyx-tabs' );
		do_blocks( '<!-- wp:auvyx/section {"tagName":"div","className":"auvyx-tabs"} --><div class="wp-block-auvyx-section auvyx-tabs"></div><!-- /wp:auvyx/section -->' );
		auvyx_assert_same( true, wp_script_is( 'auvyx-tabs', 'enqueued' ), 'enqueued for tabs' );
	}
);

auvyx_test(
	'gallery: a auvyx-gallery section loads the lightbox script',
	static function () {
		wp_dequeue_script( 'auvyx-gallery' );
		do_blocks( '<!-- wp:auvyx/section {"tagName":"div","className":"auvyx-gallery"} --><div class="wp-block-auvyx-section auvyx-gallery"></div><!-- /wp:auvyx/section -->' );
		auvyx_assert_same( true, wp_script_is( 'auvyx-gallery', 'enqueued' ), 'enqueued for a gallery' );
	}
);

auvyx_test(
	'video: a background video renders muted, looping, hidden from assistive tech; bad URLs render nothing',
	static function () {
		$file = do_blocks( '<!-- wp:auvyx/video {"url":"https://cdn.example.com/clip.mp4","className":"auvyx-bg-video"} /-->' );
		auvyx_assert_contains( '<video src="https://cdn.example.com/clip.mp4" autoplay muted loop playsinline', $file );
		auvyx_assert_contains( 'aria-hidden="true"', $file );
		$tube = do_blocks( '<!-- wp:auvyx/video {"url":"https://youtu.be/aqz-KE-bpKQ","className":"auvyx-bg-video"} /-->' );
		auvyx_assert_contains( 'youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1&#038;mute=1&#038;loop=1&#038;playlist=aqz-KE-bpKQ', $tube );
		auvyx_assert_contains( 'tabindex="-1"', $tube );
		auvyx_assert_same( '', trim( do_blocks( '<!-- wp:auvyx/video {"url":"javascript:alert(1)//.mp4","className":"auvyx-bg-video"} /-->' ) ) );
		auvyx_assert_not_contains( 'autoplay=1', do_blocks( '<!-- wp:auvyx/video {"url":"https://youtu.be/aqz-KE-bpKQ"} /-->' ), 'a normal video keeps its player' );
	}
);

auvyx_test(
	'video: a background video with sound starts muted, is marked for video.js, and keeps the player API open',
	static function () {
		wp_dequeue_script( 'auvyx-video-autoplay' );
		$file = do_blocks( '<!-- wp:auvyx/video {"url":"https://cdn.example.com/clip.mp4","className":"auvyx-bg-video auvyx-video-autoplay"} /-->' );
		auvyx_assert_contains( 'data-auvyx-autoplay="1"', $file );
		auvyx_assert_contains( 'autoplay muted loop', $file );
		auvyx_assert_same( true, wp_script_is( 'auvyx-video-autoplay', 'enqueued' ), 'video.js on the page' );
		$tube = do_blocks( '<!-- wp:auvyx/video {"url":"https://youtu.be/aqz-KE-bpKQ","className":"auvyx-bg-video auvyx-video-autoplay"} /-->' );
		auvyx_assert_contains( 'enablejsapi=1', $tube );
		$vimeo = do_blocks( '<!-- wp:auvyx/video {"url":"https://vimeo.com/76979871","className":"auvyx-bg-video auvyx-video-autoplay"} /-->' );
		auvyx_assert_not_contains( 'background=1', $vimeo );
		auvyx_assert_not_contains( 'data-auvyx-autoplay', do_blocks( '<!-- wp:auvyx/video {"url":"https://cdn.example.com/clip.mp4","className":"auvyx-bg-video"} /-->' ), 'no sound, no script' );
	}
);

auvyx_test(
	'animate: a block with auvyx-animate-* loads the observer script; plain blocks do not',
	static function () {
		wp_dequeue_script( 'auvyx-animate' );
		do_blocks( '<!-- wp:auvyx/heading {"level":2} --><h2 class="wp-block-auvyx-heading">Plain</h2><!-- /wp:auvyx/heading -->' );
		auvyx_assert_same( false, wp_script_is( 'auvyx-animate', 'enqueued' ), 'no script without an animation' );
		$html = do_blocks( '<!-- wp:auvyx/heading {"level":2,"className":"auvyx-animate-up auvyx-delay-1"} --><h2 class="wp-block-auvyx-heading auvyx-animate-up auvyx-delay-1">Hi</h2><!-- /wp:auvyx/heading -->' );
		auvyx_assert_contains( 'auvyx-animate-up', $html );
		auvyx_assert_same( true, wp_script_is( 'auvyx-animate', 'enqueued' ), 'script enqueued for an animated block' );
		ob_start();
		do_action( 'wp_head' );
		auvyx_assert_contains( 'classList.add("auvyx-anim")', (string) ob_get_clean() );
	}
);

auvyx_test(
	'header: a sticky or overlay header loads the scroll script; a plain header does not',
	static function () {
		wp_dequeue_script( 'auvyx-header' );
		do_blocks( '<!-- wp:auvyx/section {"tagName":"header"} --><header class="wp-block-auvyx-section"></header><!-- /wp:auvyx/section -->' );
		auvyx_assert_same( false, wp_script_is( 'auvyx-header', 'enqueued' ), 'plain header' );
		$html = do_blocks( '<!-- wp:auvyx/section {"tagName":"header","className":"auvyx-header-sticky auvyx-header-shrink"} --><header class="wp-block-auvyx-section auvyx-header-sticky auvyx-header-shrink"></header><!-- /wp:auvyx/section -->' );
		auvyx_assert_contains( 'auvyx-header-shrink', $html );
		auvyx_assert_same( true, wp_script_is( 'auvyx-header', 'enqueued' ), 'sticky header' );
		auvyx_assert_contains( ':is(.wp-block-template-part,.auvyx-fragment):has(>.auvyx-header-sticky){position:sticky', (string) file_get_contents( AUVYX_BUILDER_DIR . 'assets/blocks.css' ) );
	}
);

auvyx_test(
	'shortcode block: an unregistered shortcode (a kept Flatsome element) prints nothing; a registered one renders',
	static function () {
		auvyx_assert_same( '', trim( do_blocks( "<!-- wp:shortcode -->\n[ux_instagram_feed username=\"x\"]\n<!-- /wp:shortcode -->" ) ) );
		add_shortcode( 'auvyx_test_hello', static fn() => 'hello' );
		auvyx_assert_contains( 'hello', do_blocks( "<!-- wp:shortcode -->\n[auvyx_test_hello]\n<!-- /wp:shortcode -->" ) );
		remove_shortcode( 'auvyx_test_hello' );
	}
);

auvyx_test(
	'page title: hide, or align across the content column, per page; a title in a list is left alone',
	static function () {
		$id = wp_insert_post(
			array(
				'post_type'   => 'page',
				'post_status' => 'publish',
				'post_title'  => 'Title test',
			)
		);
		$block = array( 'blockName' => 'core/post-title' );
		$html  = '<h1 class="wp-block-post-title">Title test</h1>';
		auvyx_assert_same( 'center', \Auvyx\Builder\Modules\PageTitle\PageTitle::sanitize( 'center' ) );
		auvyx_assert_same( '', \Auvyx\Builder\Modules\PageTitle\PageTitle::sanitize( '<script>' ), 'unknown values are dropped' );
		$GLOBALS['wp_query'] = new WP_Query( array( 'page_id' => $id ) );
		$GLOBALS['wp_query']->the_post();
		$module = new \Auvyx\Builder\Modules\PageTitle\PageTitle();
		auvyx_assert_same( $html, $module->render( $html, $block ), 'no setting keeps the theme title' );
		update_post_meta( $id, 'auvyx_title', 'center' );
		$out = $module->render( $html, $block );
		auvyx_assert_contains( 'alignwide', $out );
		auvyx_assert_contains( 'has-text-align-center', $out );
		update_post_meta( $id, 'auvyx_title', 'hide' );
		auvyx_assert_same( '', $module->render( $html, $block ) );
		wp_reset_postdata();
		$other = wp_insert_post(
			array(
				'post_type'   => 'page',
				'post_status' => 'publish',
				'post_title'  => 'Other',
			)
		);
		$GLOBALS['wp_query'] = new WP_Query( array( 'page_id' => $other ) );
		$GLOBALS['wp_query']->the_post();
		auvyx_assert_same( $html, $module->render( $html, $block ), 'a title that is not this page\'s is untouched' );
		wp_reset_postdata();
	}
);
