<?php
/**
 * Safe writes for MCP (docs/mcp-v2.md): a version check, drafts by default, a revision for every save, code that waits
 * for an administrator. One path for every write: save, restore, create with content, and the approval of waiting code.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\Mcp;

use Auvyx\Builder\Modules\McpAccess\McpAccess;

defined( 'ABSPATH' ) || exit;

final class Writes {

	/** Post meta on revisions: who made them (`mcp:<token name>`). */
	public const VIA_META = 'auvyx_mcp_via';

	/** The keys of the `auvyx` attribute only users with unfiltered_html keep (CustomCss::guard). */
	public const CODE_KEYS = array( 'code', 'css', 'sandbox' );

	private const LIVE = array( 'publish', 'private', 'future' );

	/**
	 * The page's version: its last modification and its latest revision, plus the current user's autosave (an MCP
	 * save of a published page writes that autosave, so the owner's own autosave counts as an edit too).
	 */
	public static function version( \WP_Post $post ): string {
		$revisions = wp_get_post_revisions(
			$post->ID,
			array(
				'posts_per_page' => 1,
				'orderby'        => 'ID',
				'order'          => 'DESC',
				'fields'         => 'ids',
			)
		);
		$version   = $post->post_modified_gmt . '~' . (int) ( $revisions ? reset( $revisions ) : 0 );
		$autosave  = get_current_user_id() > 0 ? wp_get_post_autosave( $post->ID, get_current_user_id() ) : false;
		if ( $autosave instanceof \WP_Post ) {
			$version .= '~a' . $autosave->ID . '@' . $autosave->post_modified_gmt;
		}
		return $version;
	}

	/**
	 * Each element's code (the `auvyx` keys only scripting users keep), by its Studio path ("0.2.1"): the same positions
	 * the Studio's tree gives (Studio::tree skips empty freeform text).
	 *
	 * @return array<string, string> path => canonical JSON of its code keys
	 */
	public static function code_map( string $content ): array {
		$out = array();
		self::walk( parse_blocks( $content ), '', $out );
		return $out;
	}

	/**
	 * @param array<int, array<string, mixed>> $blocks Parsed blocks.
	 * @param array<string, string>            $out    Found.
	 */
	private static function walk( array $blocks, string $base, array &$out ): void {
		$i = 0;
		foreach ( $blocks as $block ) {
			if ( null === $block['blockName'] && '' === trim( (string) $block['innerHTML'] ) ) {
				continue;
			}
			$path = '' === $base ? (string) $i : $base . '.' . $i;
			++$i;
			$code = array();
			foreach ( self::CODE_KEYS as $key ) {
				if ( isset( $block['attrs']['auvyx'][ $key ] ) && array() !== $block['attrs']['auvyx'][ $key ] && '' !== $block['attrs']['auvyx'][ $key ] ) {
					$code[ $key ] = $block['attrs']['auvyx'][ $key ];
				}
			}
			if ( $code ) {
				$out[ $path ] = (string) wp_json_encode( $code );
			}
			if ( ! empty( $block['innerBlocks'] ) ) {
				self::walk( $block['innerBlocks'], $path, $out );
			}
		}
	}

	/**
	 * The elements of `$next` whose code is new or changed compared with `$current` (moving an element with its code
	 * unchanged is not a change; removing code needs no approval).
	 *
	 * @return string[] Studio paths.
	 */
	public static function code_changes( string $current, string $next ): array {
		$had = array_count_values( array_values( self::code_map( $current ) ) );
		$out = array();
		foreach ( self::code_map( $next ) as $path => $code ) {
			if ( ! empty( $had[ $code ] ) ) {
				--$had[ $code ];
			} else {
				$out[] = (string) $path;
			}
		}
		return $out;
	}

	public static function is_live( \WP_Post $post ): bool {
		return in_array( $post->post_status, self::LIVE, true );
	}

	/**
	 * Saves content into a page the safe way.
	 *
	 * @param \WP_Post             $post The page.
	 * @param array<string, mixed> $args content, title?, status?, template?, approved? (the waiting code's approval),
	 *                                   where? (approval: the destination recorded when it was kept aside), via? (the
	 *                                   revision's `via`, default `mcp:<token name>`).
	 * @return array<string, mixed>|\WP_Error {id, status, where: draft|autosave|live, version, link, preview, template,
	 *                                         revision?, forced?, pendingCode?}
	 */
	public static function save( \WP_Post $post, array $args ) {
		$content  = (string) ( $args['content'] ?? '' );
		$title    = isset( $args['title'] ) ? sanitize_text_field( (string) $args['title'] ) : null;
		$want     = isset( $args['status'] ) ? (string) $args['status'] : '';
		$template = isset( $args['template'] ) ? (string) $args['template'] : null;
		$approved = ! empty( $args['approved'] );
		if ( strlen( $content ) > 4 * MB_IN_BYTES ) {
			return new \WP_Error( 'auvyx_mcp_too_big', __( 'The content is too large.', 'auvyx-builder' ), array( 'status' => 413 ) );
		}
		if ( null !== $template && '' !== $template && ! in_array( $template, array_column( Mcp::page_templates(), 'slug' ), true ) ) {
			return new \WP_Error( 'auvyx_mcp_template', __( 'No such page template.', 'auvyx-builder' ), array( 'status' => 400 ) );
		}
		$type        = get_post_type_object( $post->post_type );
		$may_publish = $approved ? true : ( McpAccess::can( 'publish' ) && $type && current_user_can( $type->cap->publish_posts ) );
		$wants_live  = in_array( $want, array( 'publish', 'private' ), true );
		$forced      = false;
		$status      = 'auto-draft' === $post->post_status ? 'draft' : $post->post_status;
		if ( isset( $args['where'] ) ) {
			// An approval puts the content where the save would have put it.
			$where = (string) $args['where'];
			if ( 'draft' === $where && self::is_live( $post ) ) {
				$where = 'autosave'; // published meanwhile: the approved content does not go live by itself
			} elseif ( 'autosave' === $where && ! self::is_live( $post ) ) {
				$where = 'draft';
			} elseif ( 'live' === $where && ! self::is_live( $post ) ) {
				$status = $wants_live ? $want : 'publish';
			}
		} elseif ( self::is_live( $post ) ) {
			if ( $wants_live && $may_publish ) {
				$where  = 'live';
				$status = $want;
			} else {
				$where  = 'autosave';
				$forced = $wants_live;
			}
		} elseif ( $wants_live && $may_publish ) {
			$where  = 'live';
			$status = $want;
		} else {
			$where  = 'draft';
			$forced = $wants_live;
			if ( in_array( $want, array( 'draft', 'pending' ), true ) ) {
				$status = $want;
			}
		}

		$code_ok = $approved || ( McpAccess::can( 'code' ) && current_user_can( 'unfiltered_html' ) );
		$waits   = $code_ok ? array() : self::code_changes( (string) $post->post_content, $content );
		$checked = ! $code_ok && McpAccess::code_narrowed();
		if ( $checked ) {
			$waits = array_values( array_unique( array_merge( $waits, self::unsafe_blocks( (string) $post->post_content, $content ) ) ) );
		}
		if ( $waits ) {
			Pending::keep(
				$post,
				array(
					'content'  => $content,
					'title'    => $title,
					'status'   => $want,
					'template' => $template,
					'where'    => $where,
					'elements' => $waits,
				)
			);
			return self::answer( $post, $where, null, $forced, $waits );
		}
		$via   = isset( $args['via'] ) ? (string) $args['via'] : McpAccess::via();
		$write = static function () use ( $post, $where, $content, $title, $status, $template, $forced, $via ) {
			return self::write( $post, $where, $content, $title, $status, $template, $forced, $via );
		};
		return $checked ? McpAccess::with_unfiltered( $write ) : $write();
	}

	/**
	 * @return array<string, mixed>|\WP_Error
	 */
	private static function write( \WP_Post $post, string $where, string $content, ?string $title, string $status, ?string $template, bool $forced, string $via ) {
		$before = self::latest_revision( $post->ID );
		if ( 'autosave' === $where ) {
			require_once ABSPATH . 'wp-admin/includes/post.php';
			$saved = wp_create_post_autosave(
				wp_slash(
					array(
						'post_ID'      => $post->ID,
						'post_type'    => $post->post_type,
						'post_content' => $content,
						'post_title'   => null === $title ? $post->post_title : $title,
						'post_excerpt' => $post->post_excerpt,
					)
				)
			);
			if ( is_wp_error( $saved ) ) {
				return $saved;
			}
			$autosave = wp_get_post_autosave( $post->ID, get_current_user_id() );
			if ( $autosave instanceof \WP_Post ) {
				update_metadata( 'post', $autosave->ID, self::VIA_META, $via );
			}
			return self::answer( get_post( $post->ID ), $where, $autosave instanceof \WP_Post ? $autosave->ID : null, $forced, array() );
		}
		$data = array(
			'ID'           => $post->ID,
			'post_content' => $content,
			'post_status'  => $status,
		);
		if ( null !== $title ) {
			$data['post_title'] = $title;
		}
		if ( null !== $template ) {
			$data['page_template'] = $template;
		}
		$id = wp_update_post( wp_slash( $data ), true );
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		$after = self::latest_revision( $post->ID );
		if ( $after > $before ) {
			update_metadata( 'post', $after, self::VIA_META, $via );
		}
		return self::answer( get_post( $post->ID ), $where, $after > $before ? $after : null, $forced, array() );
	}

	/**
	 * Blocks of `$next` that are new or changed (by their own markup, children aside) and that kses would alter: what
	 * only a user with unfiltered_html may save (a script, an iframe, an event attribute…).
	 *
	 * @return string[] Studio paths.
	 */
	public static function unsafe_blocks( string $current, string $next ): array {
		$had = array();
		self::own_forms( parse_blocks( $current ), '', $had );
		$had  = array_count_values( array_values( $had ) );
		$have = array();
		self::own_forms( parse_blocks( $next ), '', $have );
		$out = array();
		foreach ( $have as $path => $own ) {
			if ( ! empty( $had[ $own ] ) ) {
				--$had[ $own ];
				continue;
			}
			if ( wp_kses_post( $own ) !== $own ) {
				$out[] = (string) $path;
			}
		}
		return $out;
	}

	/**
	 * Each block's own serialized form (its comment, attributes and HTML, without its children), by Studio path.
	 *
	 * @param array<int, array<string, mixed>> $blocks Parsed blocks.
	 * @param array<string, string>            $out    Found.
	 */
	private static function own_forms( array $blocks, string $base, array &$out ): void {
		$i = 0;
		foreach ( $blocks as $block ) {
			if ( null === $block['blockName'] && '' === trim( (string) $block['innerHTML'] ) ) {
				continue;
			}
			$path                = '' === $base ? (string) $i : $base . '.' . $i;
			$own                 = $block;
			$own['innerBlocks']  = array();
			$own['innerContent'] = array( implode( '', array_filter( (array) $block['innerContent'], 'is_string' ) ) );
			$out[ $path ]        = serialize_block( $own );
			++$i;
			if ( ! empty( $block['innerBlocks'] ) ) {
				self::own_forms( $block['innerBlocks'], $path, $out );
			}
		}
	}

	private static function latest_revision( int $id ): int {
		$ids = wp_get_post_revisions(
			$id,
			array(
				'posts_per_page' => 1,
				'orderby'        => 'ID',
				'order'          => 'DESC',
				'fields'         => 'ids',
			)
		);
		return $ids ? (int) reset( $ids ) : 0;
	}

	/**
	 * @param string[] $pending Elements whose code waits.
	 * @return array<string, mixed>
	 */
	private static function answer( \WP_Post $post, string $where, ?int $revision, bool $forced, array $pending ): array {
		$out = array(
			'id'       => $post->ID,
			'status'   => $post->post_status,
			'where'    => $where,
			'version'  => self::version( $post ),
			'link'     => (string) get_permalink( $post ),
			'preview'  => array() !== $pending ? '' : ( 'live' === $where ? (string) get_permalink( $post ) : Mcp::preview_url( $post->ID, 'autosave' === $where ) ),
			'template' => (string) get_page_template_slug( $post ),
		);
		if ( null !== $revision ) {
			$out['revision'] = $revision;
		}
		if ( $forced ) {
			$out['forced'] = 'draft'; // asked to publish without the `publish` scope
		}
		if ( $pending ) {
			$out['pendingCode'] = $pending;
		}
		return $out;
	}

	/**
	 * The last 20 revisions (autosaves included, marked), newest first.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public static function revisions( \WP_Post $post ): array {
		$out = array();
		foreach ( wp_get_post_revisions(
			$post->ID,
			array(
				'posts_per_page' => 20,
				'orderby'        => 'ID',
				'order'          => 'DESC',
			)
		) as $revision ) {
			$author = get_userdata( (int) $revision->post_author );
			$out[]  = array(
				'id'       => $revision->ID,
				'date'     => mysql_to_rfc3339( $revision->post_modified_gmt ),
				'author'   => $author ? $author->display_name : '',
				'via'      => (string) get_metadata( 'post', $revision->ID, self::VIA_META, true ),
				'title'    => $revision->post_title,
				'autosave' => (bool) wp_is_post_autosave( $revision ),
			);
		}
		return $out;
	}
}
