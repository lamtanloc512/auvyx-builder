<?php
/**
 * Auvyx Studio payload: parse_blocks → Studio tree, and config.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\Blocks\Markup;
use Auvyx\Builder\Modules\Studio\Studio;
use Auvyx\Builder\Plugin;

auvyx_test(
	'tree: Auvyx blocks become elements with styles, supports, text and href',
	static function () {
		$content = Markup::section(
			array(
				Markup::heading( 'Hello <strong>you</strong>', 1, Markup::styles( array( 'color' => 'red' ) ) ),
				Markup::button( 'Go &amp; see', 'https://example.com/?a=1&b=2' ),
			),
			Markup::styles( array( 'gap' => '1rem' ) ),
			array( 'align' => 'full', 'tagName' => 'div' )
		);
		$tree    = Studio::tree( parse_blocks( $content ) );
		$section = $tree[0];
		auvyx_assert_same( 'auvyx/section', $section['block'] );
		auvyx_assert_same( 'div', $section['tag'] );
		auvyx_assert_same( 'full', $section['align'] );
		auvyx_assert_same( '1rem', $section['styles']->base['default']['gap'] );
		auvyx_assert_same( 1, $section['children'][0]['level'] );
		auvyx_assert_same( 'Hello <strong>you</strong>', $section['children'][0]['text'] );
		auvyx_assert_same( 'Go &amp; see', $section['children'][1]['text'] );
		auvyx_assert_same( 'https://example.com/?a=1&b=2', $section['children'][1]['href'] );
	}
);

auvyx_test(
	'tree: other blocks are kept verbatim with a rendered preview; blank freeform dropped',
	static function () {
		$content = "<!-- wp:paragraph -->\n<p>Core</p>\n<!-- /wp:paragraph -->\n\n";
		$tree    = Studio::tree( parse_blocks( $content ) );
		auvyx_assert_same( 1, count( $tree ) );
		auvyx_assert_same( 'core/paragraph', $tree[0]['block'] );
		auvyx_assert_same( "<!-- wp:paragraph -->\n<p>Core</p>\n<!-- /wp:paragraph -->", $tree[0]['raw'] );
		auvyx_assert_contains( 'Core', $tree[0]['html'] );
	}
);

auvyx_test(
	'config: REST target, canvas URL, design system and blocks',
	static function () {
		wp_set_current_user( 1 );
		$id     = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Studio page', 'post_content' => wp_slash( Markup::text( 'Hi' ) ) ) );
		$config = Plugin::instance()->module( 'studio' )->config( get_post( $id ) );
		auvyx_assert_same( 'pages', $config['restBase'] );
		auvyx_assert_contains( 'auvyx-canvas=', $config['canvasUrl'] );
		auvyx_assert_same( 'Hi', $config['blocks'][0]['text'] );
		auvyx_assert_same( true, count( $config['designSystem']['breakpoints'] ) >= 3 );
		auvyx_assert_contains( '\u003C', wp_json_encode( array( 'x' => '</script>' ), JSON_HEX_TAG ), 'config JSON cannot close the script tag' );
	}
);

auvyx_test(
	'admin menu: Auvyx Builder with Pages, Patterns & components, Theme Builder, Site templates, Design system, Content types, AI connections, Settings (and Pro licence only with Pro)',
	static function () {
		global $submenu;
		wp_set_current_user( 1 );
		require_once ABSPATH . 'wp-admin/includes/plugin.php'; // add_menu_page() outside wp-admin.
		Plugin::instance()->module( 'studio' )->menu();
		$titles = array_column( $submenu['auvyx-builder'] ?? array(), 0 );
		auvyx_assert_same( array( 'Pages', 'Patterns & components', 'Theme Builder', 'Site templates', 'Design system', 'Content types', 'AI connections', 'Settings' ), array_values( array_diff( $titles, array( 'Pro licence' ) ) ) );
		auvyx_assert_same( \Auvyx\Builder\Modules\Edition\Edition::pro(), in_array( 'Pro licence', $titles, true ), 'no "Get Pro" page: a tab only while Pro is active' );
	}
);

auvyx_test(
	'tree + render: image, icon, divider, video, accordion (Studio snapshot markup)',
	static function () {
		$markup = (string) file_get_contents( AUVYX_BUILDER_DIR . 'tests/fixtures/studio.html' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		$tree   = Studio::tree( parse_blocks( $markup ) );
		$kids   = array();
		foreach ( $tree[0]['children'] as $child ) {
			$kids += array( $child['block'] => $child ); // first of each kind
		}
		auvyx_assert_same( 'https://example.com/a.jpg?x=1&y=2', $kids['auvyx/image']['src'] );
		auvyx_assert_same( 'A "quoted" alt', $kids['auvyx/image']['alt'] );
		auvyx_assert_same( 'star', $kids['auvyx/icon']['icon'] );
		auvyx_assert_same( 'https://youtu.be/dQw4w9WgXcQ', $kids['auvyx/video']['src'] );
		auvyx_assert_same( 'Question <em>one</em>?', $kids['auvyx/accordion']['text'] );
		auvyx_assert_same( 'Answer.', $kids['auvyx/accordion']['children'][0]['text'] );
		auvyx_assert_same( 'M0 0L120 40C80 80 40 80 0 40Z', $kids['auvyx/vector']['src'] );
		auvyx_assert_same( '0 0 120 80', $kids['auvyx/vector']['alt'] );

		$html = do_blocks( $markup );
		auvyx_assert_contains( '<span class="wp-block-auvyx-icon" aria-hidden="true"><svg', $html, 'icon rendered from the icon set' );
		auvyx_assert_contains( 'src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"', $html, 'video embed' );
		auvyx_assert_contains( '<details class="wp-block-auvyx-accordion"><summary>Question <em>one</em>?</summary>', $html );
		auvyx_assert_same( '', trim( do_blocks( '<!-- wp:auvyx/video {"url":"https://evil.test/x"} /-->' ) ), 'unknown hosts render nothing' );
		auvyx_assert_contains( 'viewBox="0 0 120 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0L120 40C80 80 40 80 0 40Z" vector-effect="non-scaling-stroke"/>', $html, 'vector rendered' );
		$evil = do_blocks( '<!-- wp:auvyx/vector {"path":"M0 0\\u0022 onload=\\u0022alert(1)","viewBox":"0 0 1 1\\u0022 x=\\u0022"} /-->' );
		auvyx_assert_contains( '<path d=""', $evil, 'unsafe path data is dropped' );
		auvyx_assert_contains( 'viewBox="0 0 100 100"', $evil, 'unsafe viewBox falls back' );
		auvyx_assert_not_contains( 'onload', $evil );
	}
);

auvyx_test(
	'template library is registered as patterns with real asset URLs',
	static function () {
		$registry = WP_Block_Patterns_Registry::get_instance();
		foreach ( array( 'hero-centered', 'pricing', 'icon-box', 'row-3', 'banner', 'footer' ) as $id ) {
			auvyx_assert_same( true, $registry->is_registered( 'auvyx-builder/' . $id ), $id );
		}
		$banner = $registry->get_registered( 'auvyx-builder/banner' )['content'];
		auvyx_assert_not_contains( 'auvyx.invalid', $banner );
		auvyx_assert_contains( 'plugins/auvyx-builder/assets/placeholders/landscape.svg', $banner );
		$html = do_blocks( $registry->get_registered( 'auvyx-builder/pricing' )['content'] );
		auvyx_assert_contains( 'wp-block-auvyx-icon', $html, 'icons render inside templates' );
		auvyx_assert_same( 0, preg_match( '/(Warning|Notice|Fatal)/', $html ) );
	}
);

auvyx_test(
	'links on images and icons survive import and render',
	static function () {
		$markup = (string) file_get_contents( AUVYX_BUILDER_DIR . 'tests/fixtures/studio.html' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		$tree   = Studio::tree( parse_blocks( $markup ) );
		$by_src = array();
		foreach ( $tree[0]['children'] as $child ) {
			$by_src[ $child['block'] . ':' . ( $child['src'] ?: $child['icon'] ) ] = $child;
		}
		auvyx_assert_same( 'https://example.com/page', $by_src['auvyx/image:https://example.com/b.jpg']['href'] );
		auvyx_assert_same( 'https://facebook.com/', $by_src['auvyx/icon:facebook']['href'] );
		$html = do_blocks( $markup );
		auvyx_assert_contains( '<a href="https://example.com/page" class="wp-block-auvyx-image"', str_replace( 'class="wp-block-auvyx-image" href="https://example.com/page"', 'href="https://example.com/page" class="wp-block-auvyx-image"', $html ) );
		auvyx_assert_same( 1, preg_match( '#<a [^>]*href="https://facebook.com/"[^>]*>\s*<svg#', $html ), 'linked icon: ' . substr( $html, strpos( $html, 'facebook' ) - 120, 260 ) );
	}
);

auvyx_test(
	'edit lock: free → acquired; another user sees the holder; takeover wins',
	static function () {
		$first  = wp_insert_user( array( 'user_login' => 'ed1', 'user_pass' => 'x', 'role' => 'editor', 'display_name' => 'Editor One' ) );
		$second = wp_insert_user( array( 'user_login' => 'ed2', 'user_pass' => 'x', 'role' => 'editor', 'display_name' => 'Editor Two' ) );
		$page   = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Locked' ) );
		wp_set_current_user( $first );
		auvyx_assert_same( false, Studio::lock( $page )['locked'] );
		wp_set_current_user( $second );
		auvyx_assert_same( array( 'locked' => true, 'by' => 'Editor One' ), Studio::lock( $page ) );
		auvyx_assert_same( false, Studio::lock( $page, true )['locked'], 'takeover' );
		wp_set_current_user( $first );
		auvyx_assert_same( 'Editor Two', Studio::lock( $page )['by'] );
		$routes = rest_get_server()->get_routes();
		auvyx_assert_same( true, isset( $routes['/auvyx/v1/lock/(?P<id>\d+)'] ), 'REST route' );
	}
);

auvyx_test(
	'convert: core blocks become Auvyx elements with their text, links, levels and colors',
	static function () {
		$markup = '<!-- wp:group {"layout":{"type":"flex","justifyContent":"space-between"},"backgroundColor":"contrast"} --><div class="wp-block-group has-contrast-background-color"><!-- wp:heading {"level":3,"textColor":"base"} --><h3 class="wp-block-heading has-base-color">Hi <em>there</em></h3><!-- /wp:heading --><!-- wp:paragraph {"align":"center","style":{"spacing":{"padding":{"top":"var:preset|spacing|20"}}}} --><p class="has-text-align-center">Body</p><!-- /wp:paragraph --><!-- wp:buttons --><div class="wp-block-buttons"><!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link" href="https://example.com/">Go</a></div><!-- /wp:button --></div><!-- /wp:buttons --><!-- wp:image {"id":5} --><figure class="wp-block-image"><img src="https://example.com/a.jpg" alt="An image" class="wp-image-5"/></figure><!-- /wp:image --><!-- wp:latest-posts /--></div><!-- /wp:group -->';
		$tree   = Auvyx\Builder\Modules\Studio\Studio::tree( Auvyx\Builder\Modules\Studio\Convert::blocks( parse_blocks( $markup ) ) );
		$group  = $tree[0];
		auvyx_assert_same( 'auvyx/section', $group['block'] );
		auvyx_assert_same( 'row', $group['styles']->base['default']['flex-direction'] );
		auvyx_assert_same( 'space-between', $group['styles']->base['default']['justify-content'] );
		auvyx_assert_same( 'var(--wp--preset--color--contrast)', $group['styles']->base['default']['background-color'] );
		list( $heading, $text, $buttons, $image, $raw ) = $group['children'];
		auvyx_assert_same( array( 'auvyx/heading', 3, 'Hi <em>there</em>' ), array( $heading['block'], $heading['level'], $heading['text'] ) );
		auvyx_assert_same( 'center', $text['styles']->base['default']['text-align'] );
		auvyx_assert_same( 'var(--wp--preset--spacing--20)', $text['styles']->base['default']['padding-block-start'] );
		$go = $buttons['children'][0]['children'][0];
		auvyx_assert_same( array( 'auvyx/button', 'Go', 'https://example.com/' ), array( $go['block'], $go['text'], $go['href'] ) );
		auvyx_assert_same( array( 'auvyx/image', 'https://example.com/a.jpg', 'An image', 5 ), array( $image['block'], $image['src'], $image['alt'], $image['mediaId'] ) );
		auvyx_assert_same( 'core/latest-posts', $raw['block'], 'other blocks stay WordPress blocks' );
	}
);

auvyx_test(
	'convert: a core button keeps core\'s markup, so the theme\'s button styles (and its outline style) still apply',
	static function () {
		$markup = '<!-- wp:buttons --><div class="wp-block-buttons"><!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="/shop/">Fill</a></div><!-- /wp:button --><!-- wp:button {"className":"is-style-outline"} --><div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="/shop/">Outline</a></div><!-- /wp:button --></div><!-- /wp:buttons -->';
		$tree   = Auvyx\Builder\Modules\Studio\Studio::tree( Auvyx\Builder\Modules\Studio\Convert::blocks( parse_blocks( $markup ) ) );
		list( $fill, $outline ) = $tree[0]['children'];
		foreach ( array( $fill, $outline ) as $wrap ) {
			auvyx_assert_same( 'auvyx/section', $wrap['block'] );
			auvyx_assert_contains( 'wp-block-button', $wrap['className'], 'the wrapper core\'s CSS and themes hook on' );
			$link = $wrap['children'][0];
			auvyx_assert_same( 'auvyx/button', $link['block'] );
			auvyx_assert_contains( 'wp-block-button__link', $link['className'] );
			auvyx_assert_contains( 'wp-element-button', $link['className'] );
		}
		auvyx_assert_contains( 'is-style-outline', $outline['className'], 'the outline style stays on the wrapper, as in core' );
		$own  = do_blocks( '<!-- wp:auvyx/button --><a class="wp-block-auvyx-button" href="#">Own</a><!-- /wp:auvyx/button -->' );
		$core = do_blocks( '<!-- wp:auvyx/button {"className":"wp-block-button__link wp-element-button"} --><a class="wp-block-auvyx-button wp-block-button__link wp-element-button" href="#">Core</a><!-- /wp:auvyx/button -->' );
		auvyx_assert_contains( 'auvyx-squircle', $own, 'an Auvyx button is rounded smoothly by default' );
		auvyx_assert_same( false, false !== strpos( $core, 'auvyx-squircle' ), 'a core button keeps core\'s corners' );
		auvyx_assert_same( false, false !== strpos( $fill['className'], 'is-style-outline' ) );
	}
);

auvyx_test(
	'convert keeps the look: classes, alignment, constrained and grid layouts; a pattern reference becomes its blocks',
	static function () {
		register_block_pattern(
			'auvyx-test/band',
			array(
				'title'      => 'Band',
				'categories' => array( 'featured' ),
				'content'    => '<!-- wp:group {"align":"full","className":"auvyx-band","layout":{"type":"constrained"}} --><div class="wp-block-group alignfull auvyx-band"><!-- wp:group {"align":"wide","layout":{"type":"grid","columnCount":3,"minimumColumnWidth":"16rem"}} --><div class="wp-block-group alignwide"><!-- wp:paragraph --><p>One</p><!-- /wp:paragraph --></div><!-- /wp:group --></div><!-- /wp:group -->',
			)
		);
		$tree = Auvyx\Builder\Modules\Studio\Studio::tree( Auvyx\Builder\Modules\Studio\Convert::blocks( parse_blocks( '<!-- wp:pattern {"slug":"auvyx-test/band"} /--><!-- wp:pattern {"slug":"auvyx-test/missing"} /-->' ) ) );
		auvyx_assert_same( 2, count( $tree ), 'the pattern\'s band, and the unknown reference as it was' );
		$band = $tree[0];
		auvyx_assert_same( array( 'auvyx/section', 'full' ), array( $band['block'], $band['align'] ) );
		auvyx_assert_contains( 'auvyx-band', $band['className'], 'its own class' );
		auvyx_assert_contains( 'is-layout-flow', $band['className'], 'the theme still spaces its children' );
		auvyx_assert_not_contains( 'is-layout-constrained', $band['className'], 'no theme rule caps its children' );
		$grid = $band['children'][0];
		auvyx_assert_same( 'wide', $grid['align'] );
		auvyx_assert_same( 'grid', $grid['styles']->base['default']['display'] );
		auvyx_assert_same( 'var(--wp--style--global--wide-size)', $grid['styles']->base['default']['max-width'], 'a wide child is capped at the wide width' );
		auvyx_assert_contains( 'auto-fill', $grid['styles']->base['default']['grid-template-columns'] );
		auvyx_assert_same( 'core/pattern', $tree[1]['block'] );
		$listed = wp_list_pluck( Auvyx\Builder\Modules\Studio\Studio::patterns(), 'slug' );
		auvyx_assert_same( true, in_array( 'auvyx-test/band', $listed, true ), 'offered to the AI agent' );
		unregister_block_pattern( 'auvyx-test/band' );
		$presets = Auvyx\Builder\Modules\Studio\Studio::theme_presets();
		auvyx_assert_same( true, is_array( $presets['colors'] ) && is_array( $presets['fontSizes'] ), 'theme presets' );
	}
);

auvyx_test(
	'convert: a constrained group\'s widths become its children\'s own styles, so each can be made wider or full',
	static function () {
		$markup = '<!-- wp:group {"align":"full","layout":{"type":"constrained","contentSize":"780px","justifyContent":"left"}} --><div class="wp-block-group alignfull">'
			. '<!-- wp:columns --><div class="wp-block-columns"><!-- wp:column --><div class="wp-block-column"><!-- wp:paragraph --><p>A</p><!-- /wp:paragraph --></div><!-- /wp:column --></div><!-- /wp:columns -->'
			. '<!-- wp:heading {"style":{"spacing":{"margin":{"left":"40px"}}}} --><h2 class="wp-block-heading" style="margin-left:40px">B</h2><!-- /wp:heading -->'
			. '<!-- wp:embed {"url":"https://www.youtube.com/watch?v=x","type":"video","providerNameSlug":"youtube"} --><figure class="wp-block-embed is-type-video is-provider-youtube"><div class="wp-block-embed__wrapper">https://www.youtube.com/watch?v=x</div></figure><!-- /wp:embed -->'
			. '<!-- wp:paragraph {"align":"full"} --><p class="alignfull">C</p><!-- /wp:paragraph -->'
			. '</div><!-- /wp:group -->';
		$blocks = Auvyx\Builder\Modules\Studio\Convert::blocks( parse_blocks( $markup ) );
		$tree   = Auvyx\Builder\Modules\Studio\Studio::tree( $blocks );
		$band   = $tree[0];
		auvyx_assert_not_contains( 'is-layout-constrained', (string) $band['className'] );
		auvyx_assert_same( 'var(--wp--style--root--padding-left)', $band['styles']->base['default']['padding-inline-start'], 'the root padding is a style' );
		list( $row, $heading, $embed, $full ) = $band['children'];
		$width = $row['styles']->base['default'];
		auvyx_assert_same( array( '780px', '0', 'auto' ), array( $width['max-width'], $width['margin-inline-start'], $width['margin-inline-end'] ), 'the group\'s own content width, justified left' );
		auvyx_assert_same( '40px', $heading['styles']->base['default']['margin-inline-start'], 'a margin of its own wins' );
		auvyx_assert_same( array( 'auvyx/section', 'core/embed' ), array( $embed['block'], $embed['children'][0]['block'] ), 'a WordPress block is wrapped, its markup as it was' );
		auvyx_assert_same( '780px', $embed['styles']->base['default']['max-width'], 'the wrapper carries its width' );
		auvyx_assert_same( 'full', $full['align'] );
		auvyx_assert_same( false, isset( $full['styles']->base['default']['max-width'] ), 'a full child is not capped' );
		auvyx_assert_contains( 'is-provider-youtube', (string) $embed['children'][0]['raw'], 'the embed keeps its own markup' );
	}
);

auvyx_test(
	'studio: a static block that saves a shortcode previews what the shortcode prints',
	static function () {
		add_shortcode( 'auvyx_test_form', static function () {
			return '<form class="auvyx-test-form"><input name="x"></form>';
		} );
		$html = \Auvyx\Builder\Modules\Studio\Preview::html( array( 'blockName' => 'vendor/form-selector' ), '<div class="wp-block-vendor-form-selector">[auvyx_test_form id="1"]</div>' );
		auvyx_assert_contains( '<form class="auvyx-test-form">', $html );
		auvyx_assert_not_contains( '[auvyx_test_form', $html );
		remove_shortcode( 'auvyx_test_form' );
		auvyx_assert_same( '<p>See [1] and [not-a-shortcode]</p>', \Auvyx\Builder\Modules\Studio\Preview::html( array( 'blockName' => 'core/paragraph' ), '<p>See [1] and [not-a-shortcode]</p>' ), 'brackets that are not shortcodes are untouched' );
	}
);


auvyx_test(
	'menu builder: a tree saves as navigation blocks and reads back (mega, three levels, & in labels, links to pages)',
	static function () {
		wp_set_current_user( 1 );
		$page  = wp_insert_post(
			array(
				'post_type'   => 'page',
				'post_status' => 'publish',
				'post_title'  => 'Deals',
			)
		);
		$items = array(
			array(
				'label'    => 'Shop',
				'url'      => '/shop/',
				'mega'     => true,
				'children' => array(
					array(
						'label'    => 'Phones & Tablets',
						'url'      => '',
						'children' => array(
							array(
								'label'    => 'Phones',
								'url'      => '/phones/',
								'children' => array( array( 'label' => 'Too deep', 'url' => '/x/' ) ),
							),
						),
					),
				),
			),
			array(
				'label' => 'Deals',
				'url'   => get_permalink( $page ),
				'kind'  => 'post-type',
				'type'  => 'page',
				'id'    => $page,
			),
			array( 'label' => '' ),
		);
		$id    = Auvyx\Builder\Modules\Studio\MenuBuilder::save( 0, 'Main', $items );
		auvyx_assert_same( true, is_int( $id ) && $id > 0, 'a new wp_navigation' );
		$menu = current( array_filter( Auvyx\Builder\Modules\Studio\MenuBuilder::all(), static fn( $m ) => $m['id'] === $id ) );
		auvyx_assert_same( array( 'Shop', 'Deals' ), array_column( $menu['items'], 'label' ), 'empty labels dropped' );
		auvyx_assert_same( true, $menu['items'][0]['mega'] );
		auvyx_assert_same( 'Phones & Tablets', $menu['items'][0]['children'][0]['label'], 'the ampersand survives saving' );
		auvyx_assert_same( array(), $menu['items'][0]['children'][0]['children'][0]['children'], 'three levels at most' );
		auvyx_assert_same( array( 'post-type', 'page', $page ), array( $menu['items'][1]['kind'], $menu['items'][1]['type'], $menu['items'][1]['id'] ) );
		auvyx_assert_contains( '"className":"auvyx-mega"', get_post( $id )->post_content );
		auvyx_assert_same( wp_make_link_relative( get_permalink( $page ) ), $menu['items'][1]['url'], 'links inside the site are saved as paths' );
		auvyx_assert_same( 'https://example.org/x', Auvyx\Builder\Modules\Studio\MenuBuilder::relative( 'https://example.org/x' ), 'links to other sites stay whole' );
		$nav = do_blocks( '<!-- wp:auvyx/nav {"source":"nav:' . $id . '"} /-->' );
		auvyx_assert_contains( 'class="auvyx-nav__parent auvyx-nav__mega"', $nav, 'Auvyx Navigation shows the mega panel' );
		auvyx_assert_contains( 'class="auvyx-nav__group"', $nav );
		auvyx_assert_contains( '>Phones</a>', $nav );
		$routes = rest_get_server()->get_routes();
		auvyx_assert_same( true, isset( $routes['/auvyx/v1/menus'] ), 'REST route' );
	}
);

auvyx_test(
	'studio autosave: pages autosave through WordPress; a newer autosave of this user is offered back, an older or equal one is not',
	static function () {
		wp_set_current_user( 1 );
		$id   = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Live', 'post_content' => '<!-- wp:paragraph --><p>live</p><!-- /wp:paragraph -->' ) );
		$post = get_post( $id );
		auvyx_assert_same( true, \Auvyx\Builder\Modules\Studio\Studio::autosaves( $post ) );
		auvyx_assert_same( null, \Auvyx\Builder\Modules\Studio\Studio::pending_autosave( $post ), 'no autosave yet' );
		$request = new WP_REST_Request( 'POST', "/wp/v2/pages/$id/autosaves" );
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_body( (string) wp_json_encode( array( 'content' => '<!-- wp:paragraph --><p>kept aside</p><!-- /wp:paragraph -->' ) ) );
		$answer = rest_do_request( $request );
		auvyx_assert_same( 200, $answer->get_status() );
		auvyx_assert_same( true, $answer->get_data()['id'] !== $id, 'a live page keeps it aside' );
		auvyx_assert_contains( 'live', get_post( $id )->post_content, 'the live page is unchanged' );
		global $wpdb;
		$autosave = wp_get_post_autosave( $id, 1 );
		$wpdb->update( $wpdb->posts, array( 'post_modified_gmt' => gmdate( 'Y-m-d H:i:s', time() + 60 ) ), array( 'ID' => $autosave->ID ) );
		clean_post_cache( $autosave->ID );
		$pending = \Auvyx\Builder\Modules\Studio\Studio::pending_autosave( get_post( $id ) );
		auvyx_assert_same( true, is_array( $pending ) && $pending['modified'] > 0 );
		auvyx_assert_contains( 'kept aside', (string) wp_json_encode( $pending['blocks'] ) );
		$part = wp_insert_post( array( 'post_type' => 'wp_template_part', 'post_status' => 'publish', 'post_title' => 'Header', 'post_name' => 'auvyx-test-header' ) );
		auvyx_assert_same( false, \Auvyx\Builder\Modules\Studio\Studio::autosaves( get_post( $part ) ), 'parts keep the device backup only' );
	}
);

auvyx_test(
	'extensions: elements, groups and template sources from the filters reach the Studio as clean data',
	static function () {
		$elements   = static function () {
			return array(
				array( 'id' => 'acme:hero', 'title' => 'Hero <b>x</b>', 'category' => 'Acme', 'icon' => 'pattern', 'json' => 'https://example.com/hero.json', 'keywords' => array( 'banner', '<i>x</i>' ) ),
				array( 'id' => 'acme:notice', 'title' => 'Notice', 'block' => 'acme/not-registered' ),
				array( 'id' => 'Bad Id!', 'title' => 'Bad', 'json' => 'https://example.com/a.json' ),
				array( 'id' => 'acme:quote', 'title' => 'Quote', 'template' => array( 'source' => 'blocks', 'id' => 'testimonial' ), 'icon' => 'javascript:alert(1)' ),
				'not an array',
			);
		};
		$categories = static function () {
			return array( array( 'id' => 'acme', 'title' => 'Acme', 'order' => '35' ), array( 'title' => 'no id' ) );
		};
		$sources    = static function () {
			return array( array( 'id' => 'acme', 'label' => 'Acme sections', 'base' => 'https://example.com/tpl/' ), array( 'id' => 'x', 'base' => 'javascript:alert(1)' ) );
		};
		add_filter( 'auvyx_studio_elements', $elements );
		add_filter( 'auvyx_studio_categories', $categories );
		add_filter( 'auvyx_studio_template_sources', $sources );
		$ext = Auvyx\Builder\Modules\StudioExtensions\StudioExtensions::extensions();
		remove_filter( 'auvyx_studio_elements', $elements );
		remove_filter( 'auvyx_studio_categories', $categories );
		remove_filter( 'auvyx_studio_template_sources', $sources );

		auvyx_assert_same( array( 'acme:hero', 'acme:quote' ), wp_list_pluck( $ext['elements'], 'id' ), 'unregistered blocks and bad ids are left out' );
		auvyx_assert_same( 'Hero x', $ext['elements'][0]['title'] );
		auvyx_assert_same( 'acme', $ext['elements'][0]['category'] );
		auvyx_assert_same( array( 'json' => 'https://example.com/hero.json' ), $ext['elements'][0]['insert'] );
		auvyx_assert_same( array( 'banner', 'x' ), $ext['elements'][0]['keywords'] );
		auvyx_assert_same( '', $ext['elements'][1]['icon'], 'an icon is a name or an http(s) URL' );
		auvyx_assert_same( array( array( 'id' => 'acme', 'title' => 'Acme', 'order' => 35 ) ), $ext['categories'] );
		auvyx_assert_same( array( array( 'id' => 'acme', 'label' => 'Acme sections', 'base' => 'https://example.com/tpl' ) ), $ext['templateSources'] );
	}
);

auvyx_test(
	'extensions: scripts load before the Studio, http(s) URLs only',
	static function () {
		$scripts = static function () {
			return array( 'https://example.com/acme.js', 'javascript:alert(1)' );
		};
		add_filter( 'auvyx_studio_scripts', $scripts );
		$urls = Auvyx\Builder\Modules\StudioExtensions\StudioExtensions::scripts( get_post( wp_insert_post( array( 'post_type' => 'page', 'post_title' => 'x' ) ) ) );
		remove_filter( 'auvyx_studio_scripts', $scripts );
		auvyx_assert_same( array( 'https://example.com/acme.js' ), $urls );
	}
);
